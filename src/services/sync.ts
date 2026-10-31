/**
 * Live sync. Demo-flagged rows are never uploaded.
 * Signed-in users load their own family from Supabase, not Ramesh's sample data.
 */
import type { AppState, Profile, ProfileId } from '../types'
import { blankLiveState } from '../data/demoData'
import { tickReminders } from './reminderService'
import { backendConfigured, currentSession, getClient } from './backend'
import * as M from './mapping'

type Getter = () => AppState
type Setter = (s: AppState | ((prev: AppState) => AppState)) => void

let getState: Getter | null = null
let setState: Setter | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let userId: string | null = null

export function bindSync(get: Getter, set: Setter) {
  getState = get
  setState = set
}

export const liveUserId = () => userId
export const syncStatus = { state: 'off' as 'off' | 'idle' | 'syncing' | 'error', error: '' }

const real = <T extends { demo?: boolean; source?: string }>(rows: T[]) => rows.filter((r) => !M.isDemoRecord(r))

function applyMembers(s: AppState, rows: Record<string, unknown>[]): AppState {
  const profiles: Profile[] = [{ ...s.profiles.find((p) => p.id === 'self') ?? { id: 'self', name: s.onboarding.name.split(' ')[0] || 'You', relation: 'Me', initial: (s.onboarding.name[0] || 'Y').toUpperCase() } }]
  for (const r of rows) {
    const rel = String(r.relationship)
    if (rel !== 'mother' && rel !== 'father') continue
    const name = String(r.display_name || r.greeting_name || (rel === 'mother' ? 'Mummy' : 'Papa'))
    profiles.push({ id: rel, name, relation: rel === 'mother' ? 'Mother' : 'Father', initial: name[0]?.toUpperCase() || (rel === 'mother' ? 'M' : 'P') })
  }
  const active = profiles.some((p) => p.id === s.activeProfileId) ? s.activeProfileId : 'self'
  return { ...s, profiles, activeProfileId: active }
}

export async function pushNow(): Promise<void> {
  if (!userId || !backendConfigured() || !getState) return
  const s = getState()
  const db = await getClient()
  syncStatus.state = 'syncing'
  try {
    const { error: pe } = await db.from('profiles').upsert(M.profileRow(s, userId))
    if (pe) throw pe
    const members = (s.profiles.map((p) => M.familyMemberRow(s, userId!, p.id)).filter(Boolean) as NonNullable<ReturnType<typeof M.familyMemberRow>>[])
    if (members.length) {
      const { error: me } = await db.from('family_members').upsert(members)
      if (me) throw me
    }
    const meds = real(s.medicines)
    if (meds.length) {
      const { error } = await db.from('medicines').upsert(meds.map((m) => M.medicineRow(m, userId!)))
      if (error) throw error
      const schedules = meds.flatMap((m) => M.scheduleRows(m, userId!))
      if (schedules.length) {
        const { error: se } = await db.from('medicine_schedules').upsert(schedules)
        if (se) throw se
      }
      const { data: existing } = await db.from('medicine_schedules').select('id,medicine_id').eq('owner_id', userId)
      const keep = new Set(schedules.map((r) => r.id))
      const stale = (existing ?? []).filter((r) => r.medicine_id && meds.some((m) => m.id === r.medicine_id) && !keep.has(String(r.id)))
      for (const row of stale) await db.from('medicine_schedules').delete().eq('id', row.id).eq('owner_id', userId)
    }
    const evs = real(s.events)
    if (evs.length) {
      const { error } = await db.from('member_reminders').upsert(evs.map((e) => M.reminderRow(e, userId!)))
      if (error) throw error
    }
    const readings = real(s.readings)
    if (readings.length) {
      const { error } = await db.from('health_readings').upsert(readings.map((r) => M.readingRow(r, userId!)))
      if (error) throw error
    }
    const appts = real(s.appointments)
    if (appts.length) {
      const { error } = await db.from('member_appointments').upsert(appts.map((a) => M.appointmentRow(a, userId!)))
      if (error) throw error
    }
    syncStatus.state = 'idle'
    syncStatus.error = ''
  } catch (e) {
    syncStatus.state = 'error'
    syncStatus.error = e instanceof Error ? e.message : 'Sync failed'
  }
}

export function schedulePush(): void {
  if (!userId || !backendConfigured()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { void pushNow() }, 1500)
}

export async function deleteRemote(table: string, id: string): Promise<void> {
  if (!userId || !backendConfigured()) return
  const db = await getClient()
  const { error } = await db.from(table).delete().eq('id', id).eq('owner_id', userId)
  if (error) throw error
}

async function pullNow(): Promise<void> {
  if (!userId || !getState || !setState) return
  const db = await getClient()
  const uid = userId
  const get = async (t: string) => {
    const { data, error } = await db.from(t).select('*').eq('owner_id', uid)
    if (error) throw error
    return data ?? []
  }
  const [members, meds, events, readings, appts] = await Promise.all([
    get('family_members'), get('medicines'), get('member_reminders'), get('health_readings'), get('member_appointments'),
  ])
  const prof = (await db.from('profiles').select('*').eq('id', uid).maybeSingle()).data

  setState((cur) => {
    let s = cur
    if (prof) s = M.applyProfileRow(s, prof)
    s = applyMembers(s, members)
    return tickReminders({
      ...s,
      medicines: meds.map((r) => M.medicineFromRow(r, 'self')),
      events: events.map((r) => M.reminderFromRow(r, 'self')),
      readings: readings.map((r) => M.readingFromRow(r, 'self')),
      appointments: appts.map((r) => M.appointmentFromRow(r, 'self')),
    })
  })
}

export async function startSync(): Promise<void> {
  if (!backendConfigured()) return
  const session = await currentSession()
  if (!session) { stopSync(); return }
  userId = session.user.id
  const name = session.user.user_metadata?.full_name || getState?.().onboarding.name || 'You'
  if (setState) {
    setState((cur) => {
      const looksDemo = !cur || cur.onboarding.name === 'Ramesh' || cur.medicines.some((m) => m.demo) || cur.readings.some((r) => r.demo || r.source === 'demo') || cur.appointments.some((a) => a.demo)
      if (!looksDemo) return cur
      const b = blankLiveState(String(cur.onboarding.name || name))
      return {
        ...b,
        onboarding: { ...b.onboarding, ...cur.onboarding, name: cur.onboarding.name || String(name), done: cur.onboarding.done },
        settings: cur.settings,
      }
    })
  }
  try { await pullNow() } catch (e) {
    syncStatus.state = 'error'
    syncStatus.error = e instanceof Error ? e.message : 'Could not load your data'
  }
  await pushNow()
}

export function stopSync(): void {
  userId = null
  if (timer) clearTimeout(timer)
  syncStatus.state = 'off'
}

export async function persistNow(): Promise<string> {
  await pushNow()
  if (syncStatus.state === 'error') throw new Error(syncStatus.error)
  return 'Saved'
}
