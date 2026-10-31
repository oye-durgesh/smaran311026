/**
 * Offline-first sync. The local store stays the source for the UI; when signed in, changes are pushed to Supabase
 * (RLS-protected) and, on sign-in, server data is pulled. Conflict policy: last write wins per row, server rows
 * win on first sign-in when the device is empty. Server-side scheduling reads these tables, so reminders keep
 * being delivered even when the app is closed. Family sharing is NOT synced yet (schema + RLS exist).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState } from '../domain/types'
import { store } from '../store/store'
import { findExisting, selfOf } from '../domain/people'
import { remapPerson } from '../store/actions'
import { backendConfigured, currentSession, getClient } from './backend'
import * as M from './mapping'
import { listMemberships } from './familyApi'

type Sig = Map<string, string>
const pushed: Record<string, Sig> = {}
let timer: ReturnType<typeof setTimeout> | null = null
let unsubscribe: (() => void) | null = null
let userId: string | null = null
export const syncStatus = { state: 'off' as 'off' | 'idle' | 'syncing' | 'error', error: '' as string, lastAt: 0 }
const listeners = new Set<() => void>()
export const onSyncStatus = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const setStatus = (p: Partial<typeof syncStatus>) => { Object.assign(syncStatus, p); listeners.forEach((l) => l()) }

const TABLES = ['care_recipients', 'medications', 'stock_ledger', 'reminder_series', 'reminders', 'health_readings', 'appointments'] as const
type Table = (typeof TABLES)[number]

function rowsOf(s: AppState, uid: string): Record<Table, Array<Record<string, any>>> {
  return {
    care_recipients: s.people.map((p) => M.personToRow(p, uid)),
    medications: s.medicines.map((m) => M.medToRow(m, uid)),
    stock_ledger: s.medicines.flatMap((m) => M.stockToRows(m, uid)),
    reminder_series: s.series.map((x) => M.seriesToRow({ ...x, ownerId: uid })),
    reminders: s.reminders.map((r) => M.reminderToRow(r, uid)),
    health_readings: s.readings.filter((r) => r.source !== 'sample').map((r) => M.readingToRow(r, uid)),
    appointments: s.appointments.map((a) => M.apptToRow(a, uid)),
  }
}

/** Upload only what changed since the last push; delete rows removed locally. Order respects foreign keys. */
export async function pushNow(): Promise<void> {
  if (!userId || !backendConfigured()) return
  const db = await getClient()
  const s = store.get()
  if (s.demo.sampleData) return                      // never upload the design sample data
  setStatus({ state: 'syncing', error: '' })
  try {
    const prof = M.profileToRow(s, userId)
    const ps = JSON.stringify(prof)
    if ((pushed.profiles ??= new Map()).get('p') !== ps) { const { error } = await db.from('profiles').upsert(prof); if (error) throw error; pushed.profiles.set('p', ps) }
    const rows = rowsOf(s, userId)
    for (const t of TABLES) {   // care_recipients first: every other row references a person
      const sig = (pushed[t] ??= new Map())
      const changed = rows[t].filter((r) => sig.get(r.id) !== JSON.stringify(r))
      for (let i = 0; i < changed.length; i += 200) {
        const { error } = await db.from(t).upsert(changed.slice(i, i + 200)); if (error) throw error
      }
      changed.forEach((r) => sig.set(r.id, JSON.stringify(r)))
      const gone = t === 'care_recipients' ? [] : [...sig.keys()].filter((id) => !rows[t].some((r) => r.id === id)) // profiles are archived, never deleted
      if (gone.length) { const { error } = await db.from(t).delete().in('id', gone); if (error) throw error; gone.forEach((id) => sig.delete(id)) }
    }
    setStatus({ state: 'idle', lastAt: Date.now() })
  } catch (e) {
    setStatus({ state: 'error', error: e instanceof Error ? e.message : (e as { message?: string }).message ?? 'Sync failed' })
  }
}

async function fetchAll(db: SupabaseClient, uid: string) {
  const get = async (t: string, order = 'created_at') => { const { data, error } = await db.from(t).select('*').eq('owner_id', uid).order(order); if (error) throw error; return data ?? [] }
  const [people, meds, ledger, series, reminders, readings, appts, attempts] = await Promise.all([
    get('care_recipients'), get('medications'), get('stock_ledger', 'at'), get('reminder_series'), get('reminders', 'scheduled_for'), get('health_readings', 'at'), get('appointments'), get('delivery_attempts', 'at'),
  ])
  const prof = (await db.from('profiles').select('*').eq('id', uid).maybeSingle()).data
  const members = await listMemberships(uid).catch(() => [])
  return { members, people, meds, ledger, series, reminders, readings, appts, attempts, prof }
}

/** Pull on sign-in. Device empty → adopt the server. Server empty → keep local (it will be pushed). Both → server rows win per id. */
export async function pullNow(): Promise<{ adopted: boolean }> {
  if (!userId) return { adopted: false }
  const db = await getClient()
  const d = await fetchAll(db, userId)
  const serverHas = d.people.length + d.meds.length + d.reminders.length + d.readings.length + d.appts.length > 0
  if (!serverHas && !d.prof) return { adopted: false }
  const prof = d.prof ? M.profileFromRow(d.prof) : null
  // Reconcile profiles BEFORE merging records, so a profile created on this device and the same one on the server become one.
  for (const sp of d.people.map(M.personFromRow)) {
    const cur = store.get().people
    if (cur.some((p) => p.id === sp.id)) continue
    const twin = findExisting(cur, sp.relationship, sp.relationshipLabel)
    if (twin) remapPerson(twin.id, sp.id)
  }
  store.set((s) => {
    const byId = <T extends { id: string }>(local: T[], server: T[]) => [...local.filter((l) => !server.some((x) => x.id === l.id)), ...server]
    const attemptsBy = new Map<string, any[]>()
    for (const a of d.attempts) attemptsBy.set(a.reminder_id, [...(attemptsBy.get(a.reminder_id) ?? []), { at: a.at, channel: a.channel, outcome: a.outcome }])
    return {
      ...s,
      profile: prof ? { ...s.profile, ...prof.profile, onboarded: true, signedIn: true } : { ...s.profile, signedIn: true },
      prefs: prof ? { ...s.prefs, ...prof.prefs } : s.prefs,
      family: { ...s.family, members: [...s.family.members.filter((m) => !m.server), ...d.members.map(M.memberFromRow)] },
      people: byId(s.people, d.people.map(M.personFromRow)),
      activePersonId: prof?.activePersonId && d.people.some((p: any) => p.id === prof.activePersonId && p.active) ? prof.activePersonId : s.activePersonId,
      medicines: byId(s.medicines, d.meds.map((r) => {
        const med = M.medFromRow(r)
        if (med.stock) med.stock = { ...med.stock, ledger: d.ledger.filter((l: any) => l.medication_id === r.id).map(M.stockFromRow) }
        return med
      })),
      series: byId(s.series, d.series.map(M.seriesFromRow)),
      reminders: byId(s.reminders, d.reminders.map((r) => M.reminderFromRow(r, attemptsBy.get(r.id) ?? []))),
      readings: byId(s.readings, d.readings.map(M.readingFromRow)),
      appointments: byId(s.appointments, d.appts.map(M.apptFromRow)),
    }
  })
  // what we just adopted is already on the server
  const s = store.get()
  const rows = rowsOf(s, userId)
  for (const t of TABLES) pushed[t] = new Map(rows[t].filter((r) => (d as any)[({ care_recipients: 'people', stock_ledger: 'ledger', medications: 'meds', reminder_series: 'series', reminders: 'reminders', health_readings: 'readings', appointments: 'appts' } as const)[t]].some((x: any) => x.id === r.id)).map((r) => [r.id, JSON.stringify(r)]))
  return { adopted: serverHas }
}

/** Call once after sign-in (and on app start when a session already exists). */
export async function startSync(): Promise<void> {
  if (!backendConfigured()) return
  const session = await currentSession()
  if (!session) { stopSync(); return }
  userId = session.user.id
  if (unsubscribe) return
  // the account holder's own profile has a deterministic id on the server (self_<uid>); adopt it before anything is pushed
  const self = selfOf(store.get())
  if (self && self.id !== `self_${userId}`) remapPerson(self.id, `self_${userId}`)
  try { await pullNow() } catch (e) { setStatus({ state: 'error', error: e instanceof Error ? e.message : 'Could not load your data' }) }
  unsubscribe = store.subscribe(() => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void pushNow() }, 1500) })
  await pushNow()
}
export function stopSync() {
  unsubscribe?.(); unsubscribe = null; userId = null
  if (timer) clearTimeout(timer)
  for (const k of Object.keys(pushed)) delete pushed[k]
  setStatus({ state: 'off' })
}
