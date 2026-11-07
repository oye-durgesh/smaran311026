/**
 * Shared mutations for demo (local only) and live (authenticated Supabase).
 * Screens update the store; this module persists live rows and never uploads demo-flagged data.
 */
import type { AppState, Profile, ProfileId, ReminderEvent } from '../types'
import { backendConfigured, currentSession } from './backend'
import { memberId } from './mapping'
import { scheduleRowId } from './scheduleUtils'
import { deleteRemote, liveUserId, persistNow, schedulePush } from './sync'
export { liveUserId }

export type DataMode = 'demo' | 'live'
export function dataMode(): DataMode { return liveUserId() ? 'live' : 'demo' }
export function isDemoMode(): boolean { return dataMode() === 'demo' }
export function isLiveMode(): boolean { return dataMode() === 'live' }
export const liveFlag = () => !liveUserId()

export async function sessionReady(): Promise<boolean> {
  return backendConfigured() && !!(await currentSession())
}

function tagNew<T extends { demo?: boolean }>(row: T): T {
  return { ...row, demo: !liveUserId() }
}

export const withDemoFlag = tagNew

const gone = <T extends { id: string; demo?: boolean }>(prev: T[], next: T[]) =>
  prev.filter((x) => !next.some((y) => y.id === x.id) && !x.demo)

function dataSnap(s: AppState) {
  return JSON.stringify({
    o: s.onboarding, p: s.profiles, m: s.medicines, e: s.events, r: s.readings, a: s.appointments, st: s.settings,
  })
}

export async function persistFromChange(prev: AppState, next: AppState): Promise<void> {
  if (!liveUserId()) return
  if (dataSnap(prev) === dataSnap(next)) return
  const uid = liveUserId()!
  for (const m of gone(prev.medicines, next.medicines)) {
    await deleteRemote('medicines', m.id)
    await deleteRemote('medicine_schedules', `sch_${m.id}`)
    for (const t of m.times) await deleteRemote('medicine_schedules', scheduleRowId(m.id, t))
  }
  for (const n of next.medicines) {
    const p = prev.medicines.find((x) => x.id === n.id)
    if (!p) continue
    for (const t of p.times) {
      if (!n.times.includes(t)) await deleteRemote('medicine_schedules', scheduleRowId(n.id, t))
    }
  }
  for (const e of gone(prev.events, next.events)) await deleteRemote('member_reminders', e.id)
  for (const r of gone(prev.readings, next.readings)) await deleteRemote('health_readings', r.id)
  for (const a of gone(prev.appointments, next.appointments)) await deleteRemote('member_appointments', a.id)
  for (const p of prev.profiles) {
    if (p.id === 'self') continue
    if (!next.profiles.some((x) => x.id === p.id)) await deleteRemote('family_members', memberId(uid, p.id))
  }
  schedulePush()
  await persistNow()
}

export async function afterChange(): Promise<void> {
  if (!liveUserId()) return
  schedulePush()
  await persistNow()
}

export async function removeLive(table: string, id: string, demo?: boolean): Promise<void> {
  if (!liveUserId() || demo) return
  await deleteRemote(table, id)
}

export function addParentProfile(s: AppState, who: 'mother' | 'father', name: string): AppState {
  const n = name.trim()
  if (n.length < 2) return s
  if (s.profiles.some((p) => p.id === who)) {
    return { ...s, profiles: s.profiles.map((p) => (p.id === who ? { ...p, name: n, initial: n[0].toUpperCase() } : p)) }
  }
  const p: Profile = { id: who, name: n, relation: who === 'mother' ? 'Mother' : 'Father', initial: n[0].toUpperCase() }
  return { ...s, profiles: [...s.profiles, p] }
}

export function removeParentProfile(s: AppState, who: 'mother' | 'father'): AppState {
  return {
    ...s,
    profiles: s.profiles.filter((p) => p.id !== who),
    medicines: s.medicines.filter((m) => m.profileId !== who),
    events: s.events.filter((e) => e.profileId !== who),
    readings: s.readings.filter((r) => r.profileId !== who),
    appointments: s.appointments.filter((a) => a.profileId !== who),
    activeProfileId: s.activeProfileId === who ? 'self' : s.activeProfileId,
  }
}

export function customReminder(s: AppState, input: { title: string; notes?: string; date: string; time: string; profileId: ProfileId; recurrence?: ReminderEvent['recurrence']; id?: string }): AppState {
  if (input.id) {
    return {
      ...s,
      events: s.events.map((e) => (e.id === input.id ? {
        ...e, title: input.title.trim(), notes: input.notes?.trim() || undefined, date: input.date, time: input.time,
        recurrence: input.recurrence ?? e.recurrence, profileId: input.profileId,
      } : e)),
    }
  }
  const e: ReminderEvent = {
    id: `rm-${Date.now().toString(36)}`,
    profileId: input.profileId,
    medicineId: '',
    kind: 'custom',
    title: input.title.trim(),
    notes: input.notes?.trim() || undefined,
    date: input.date,
    time: input.time,
    recurrence: input.recurrence ?? 'none',
    status: 'upcoming',
    demo: liveFlag(),
  }
  return { ...s, events: [...s.events, e] }
}

export function removeReminder(s: AppState, id: string): AppState {
  return { ...s, events: s.events.filter((e) => e.id !== id) }
}
