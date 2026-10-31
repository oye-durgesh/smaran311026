import type {
  Appointment, AppState, AuditEntry, FamilyMember, Lang, Medicine, Permissions, Person, Proposal, Reading, Relationship, Reminder,
} from '../domain/types'
import { newId } from '../domain/ids'
import * as R from '../domain/reminders'
import { TransitionError } from '../domain/reminders'
import { blankMedicine, courseEnd, displayName, syncMedicineSeries, validateMedicine } from '../domain/medicines'
import { localDateKey, localTimeToUtc, pad, fmtDayTime } from '../domain/time'
import { estimateStock, txn, validateStockInput } from '../domain/inventory'
import { initialState } from './defaults'
import { activeId, findExisting, newPersonId, scoped, selfOf } from '../domain/people'
import { fileStore } from './fileStore'
import { now, store } from './store'

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = (error: string): Result<never> => ({ ok: false, error })

const OWNER = 'me'

type Listener = (r: Reminder) => void
const firedListeners = new Set<Listener>()
export const onReminderFired = (l: Listener) => { firedListeners.add(l); return () => { firedListeners.delete(l) } }
let quiet = 0
/** Run `fn` without notifying the ringer (used when building sample data). */
export function withoutRinging<T>(fn: () => T): T { quiet++; try { return fn() } finally { quiet-- } }

export function audit(actor: string, action: string, detail: string) {
  const e: AuditEntry = { id: newId('aud'), at: now().toISOString(), actor, action, detail }
  store.set((s) => ({ ...s, family: { ...s.family, audit: [e, ...s.family.audit].slice(0, 200) } }))
}

// ───────────── profile & preferences ─────────────
export const updateProfile = (patch: Partial<AppState['profile']>) =>
  store.set((s) => {
    const profile = { ...s.profile, ...patch }
    // the account holder's own profile mirrors their name; the greeting name stays a separate field
    const people = s.people.map((p) => (p.relationship === 'self' ? { ...p, displayName: profile.name, greetingName: profile.callName } : p))
    return { ...s, profile, people }
  })

// ───────────── family-member profiles ─────────────
export interface PersonInput { relationship: Exclude<Relationship, 'self'>; relationshipLabel?: string; displayName?: string; greetingName?: string; language?: Lang; phone?: string; email?: string }

/** Create a parent / family profile, or return the existing one. Submitting twice (or resuming onboarding) never duplicates. */
export function addPerson(i: PersonInput): Result<{ person: Person; created: boolean }> {
  const label = (i.relationshipLabel ?? '').trim()
  if (i.relationship === 'other' && !label) return fail('Tell us who this is, for example "Dadi".')
  if (label.length > 40 || (i.displayName ?? '').length > 80) return fail('That name is too long.')
  const s = store.get()
  const existing = findExisting(s.people, i.relationship, label)
  if (existing) {
    if (existing.archived) store.set((st) => ({ ...st, people: st.people.map((p) => (p.id === existing.id ? { ...p, archived: false } : p)) }))
    return ok({ person: { ...existing, archived: false }, created: false })
  }
  const person: Person = {
    id: newPersonId(), relationship: i.relationship, relationshipLabel: i.relationship === 'other' ? label : '', displayName: (i.displayName ?? '').trim(),
    greetingName: (i.greetingName ?? '').trim(), language: i.language ?? s.profile.language, timeZone: s.profile.timeZone, speakingSpeed: s.profile.speakingSpeed,
    reminderTone: s.profile.reminderTone, sathiVoice: 'default', notificationsEnabled: true, phone: i.phone?.trim() || undefined, email: i.email?.trim() || undefined,
    archived: false, createdAt: now().toISOString(),
  }
  store.set((st) => ({ ...st, people: [...st.people, person] }))
  return ok({ person, created: true })
}
export function updatePerson(id: string, patch: Partial<Omit<Person, 'id' | 'relationship' | 'createdAt'>>): Result<Person> {
  const cur = store.get().people.find((p) => p.id === id)
  if (!cur) return fail('That profile no longer exists.')
  const next = { ...cur, ...patch }
  store.set((s) => ({ ...s, people: s.people.map((p) => (p.id === id ? next : p)) }))
  return ok(next)
}
export const setPersonVoice = (id: string, v: Person['sathiVoice']) => updatePerson(id, { sathiVoice: v })
/** Archived profiles keep every record; they are just hidden and cannot be active. */
export function archivePerson(id: string): Result<Person> {
  const cur = store.get().people.find((p) => p.id === id)
  if (!cur) return fail('That profile no longer exists.')
  if (cur.relationship === 'self') return fail('Your own profile cannot be archived.')
  const r = updatePerson(id, { archived: true })
  if (store.get().activePersonId === id) setActivePerson(selfOf(store.get())!.id)
  return r
}
/** Give a profile its permanent id (e.g. the account id after sign-in) and move every record that referenced the old one. */
export function remapPerson(oldId: string, newId: string) {
  if (oldId === newId) return
  const mv = <T extends { personId?: string }>(l: T[]): T[] => l.map((x) => (x.personId === oldId ? { ...x, personId: newId } : x))
  store.set((s) => ({
    ...s, activePersonId: s.activePersonId === oldId ? newId : s.activePersonId,
    people: s.people.map((p) => (p.id === oldId ? { ...p, id: newId } : p)),
    medicines: mv(s.medicines), series: mv(s.series), reminders: mv(s.reminders), readings: mv(s.readings), appointments: mv(s.appointments),
  }))
}
export const restorePerson = (id: string) => updatePerson(id, { archived: false })
export function setActivePerson(id: string): Result<Person> {
  const p = store.get().people.find((x) => x.id === id && !x.archived)
  if (!p) return fail('That profile is not available.')
  store.set((s) => ({ ...s, activePersonId: id }))
  return ok(p)
}
export const updatePrefs = (patch: Partial<AppState['prefs']>) =>
  store.set((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }))
export const setDraft = (key: string, value: unknown) =>
  store.set((s) => ({ ...s, drafts: { ...s.drafts, [key]: value } }))
export const clearDraft = (key: string) =>
  store.set((s) => { const d = { ...s.drafts }; delete d[key]; return { ...s, drafts: d } })
export const setReturnTo = (route: string | null) =>
  store.set((s) => ({ ...s, setup: { ...s.setup, returnTo: route } }))

export async function wipeAll() {
  try { await fileStore.clear() } catch { /* nothing stored */ }
  store.replace(initialState())
}

// ───────────── medicines ─────────────
export const getMedicine = (id: string) => store.get().medicines.find((m) => m.id === id)

export function saveMedicine(med: Medicine) {
  store.set((s) => {
    const exists = s.medicines.some((m) => m.id === med.id)
    const withColor = med.color == null ? { ...med, color: s.medicines.length % 4 } : med
    return { ...s, medicines: exists ? s.medicines.map((m) => (m.id === med.id ? med : m)) : [...s.medicines, withColor] }
  })
}

export function addMedicines(meds: Medicine[]) {
  store.set((s) => ({ ...s, medicines: [...s.medicines, ...meds.map((m, i) => (m.color == null ? { ...m, color: (s.medicines.length + i) % 4 } : m))] }))
}

/** Store a finished (or failed) extraction run. Drafts from the previous run of the same prescription are replaced. */
export function recordExtraction(rec: AppState['setup']['extraction'], meds: Medicine[], replaceBatch?: string) {
  store.set((s) => {
    const kept = s.medicines.filter((m) => !(replaceBatch && m.extractionBatch === replaceBatch && m.status === 'draft'))
    const colored = meds.map((m, i) => ({ ...m, extractionBatch: rec?.batchId, color: (kept.length + i) % 4 }))
    return { ...s, medicines: [...kept, ...colored], setup: { ...s.setup, extraction: rec } }
  })
}
export function setPrescription(p: AppState['setup']['prescription']) {
  store.set((s) => ({ ...s, setup: { ...s.setup, prescription: p, extraction: p ? s.setup.extraction : null } }))
}

/** Validate and mark a draft as confirmed by the user (never done automatically). */
export function confirmMedicine(med: Medicine): Result<Medicine> {
  const v = validateMedicine(med)
  if (!v.ok) return fail(Object.values(v.errors)[0] ?? 'Please complete the medicine details.')
  const status: Medicine['status'] = med.status === 'active' || med.status === 'paused' ? med.status : 'confirmed'
  const next: Medicine = { ...med, status, flags: [], name: med.name.trim(), strength: med.strength.trim(), dose: med.dose.trim() }
  saveMedicine(next)
  if (next.status === 'active') resyncMedicine(next.id)
  return ok(next)
}

export function resyncMedicine(id: string) {
  const med = getMedicine(id)
  if (!med) return
  const n = now()
  store.set((s) => {
    const r = syncMedicineSeries(med, s.series, s.reminders, OWNER, n)
    return { ...s, series: r.series, reminders: r.reminders }
  })
  tick()
}

export function removeMedicine(id: string) {
  const med = getMedicine(id)
  if (!med) return
  saveMedicine({ ...med, status: 'removed', times: med.status === 'active' || med.status === 'paused' ? med.times : med.times })
  const n = now()
  store.set((s) => {
    const r = syncMedicineSeries({ ...med, status: 'removed' }, s.series, s.reminders, OWNER, n)
    return { ...s, series: r.series, reminders: r.reminders }
  })
}

export function setMedicinePaused(id: string, paused: boolean) {
  const med = getMedicine(id)
  if (!med || (med.status !== 'active' && med.status !== 'paused')) return
  const next = { ...med, status: paused ? ('paused' as const) : ('active' as const) }
  saveMedicine(next)
  const n = now()
  store.set((s) => {
    // Resuming restarts the series from now so paused days are not back-filled as missed.
    const base = syncMedicineSeries(next, s.series, s.reminders, OWNER, n)
    const series = base.series.map((x) => (x.medicineId === id && x.active && !paused ? { ...x, startAt: n.toISOString() } : x))
    return { ...s, series, reminders: base.reminders }
  })
  tick()
}

export interface ActivationSummary { count: number; reminderTimes: number }
/** The explicit confirmation step: only confirmed medicines become active. Unconfirmed drafts stay separate and get no reminders. */
export function activateConfirmed(): Result<ActivationSummary> {
  const s0 = store.get()
  const who = activeId(s0)
  const mine = (m: Medicine) => (m.personId ?? who) === who
  const pending = s0.medicines.filter((m) => m.status === 'confirmed' && mine(m))
  if (pending.length === 0) return fail('There are no confirmed medicines to activate.')
  const n = now()
  const tz = s0.profile.timeZone
  store.set((s) => {
    let series = s.series, reminders = s.reminders
    const medicines = s.medicines.map((m) => {
      if (m.status !== 'confirmed' || !mine(m)) return m // only the active person's medicines are activated
      const act: Medicine = { ...m, status: 'active', activatedAt: n.toISOString(), startedOn: localDateKey(n, tz), timeZone: tz }
      const r = syncMedicineSeries(act, series, reminders, OWNER, n)
      series = r.series; reminders = r.reminders
      return act
    })
    return { ...s, medicines, series, reminders }
  })
  tick()
  return ok({ count: pending.length, reminderTimes: pending.reduce((a, m) => a + m.times.length, 0) })
}

export const medicineBuckets = (full: AppState) => {
  const s = scoped(full) // the active family member's medicines only
  const live = s.medicines.filter((m) => m.status !== 'removed')
  return {
    drafts: live.filter((m) => m.status === 'draft'),
    confirmed: live.filter((m) => m.status === 'confirmed'),
    active: live.filter((m) => m.status === 'active' || m.status === 'paused'),
    completed: s.medicines.filter((m) => m.status === 'completed'),
  }
}

export function newDraftMedicine(source: Medicine['source'] = 'manual'): Medicine {
  return blankMedicine(store.get().profile.timeZone, now(), source)
}

// ───────────── reminders ─────────────
function mutate(id: string, fn: (r: Reminder, n: Date) => Reminder): Result<Reminder> {
  const cur = store.get().reminders.find((r) => r.id === id)
  if (!cur) return fail('That reminder no longer exists.')
  const n = now()
  try {
    const next = fn(cur, n)
    store.set((s) => ({ ...s, reminders: s.reminders.map((r) => (r.id === id ? next : r)) }))
    return ok(next)
  } catch (e) {
    if (e instanceof TransitionError) return fail(e.message)
    throw e
  }
}

/** One scheduler pass: roll recurring series forward, ring due reminders, expire stale ones. Idempotent. */
export function tick(): Reminder[] {
  const n = now()
  let fired: Reminder[] = []
  finishCourses(n)
  store.set((s) => {
    const fresh = R.materialize(s.series, s.reminders, n, 2)
    const withNew = R.addIdempotent(s.reminders, fresh).list
    const f = R.fireDue(withNew, n)
    fired = f.fired
    const expired = R.expireStale(f.reminders, n)
    const changed = fresh.length > 0 || fired.length > 0 || expired.some((r, i) => r !== f.reminders[i])
    return changed ? { ...s, reminders: expired } : s
  })
  if (!quiet) fired.forEach((r) => firedListeners.forEach((l) => l(r)))
  return fired
}

/** Fixed-length courses end after their last day: the medicine moves to "Completed" and stops generating reminders. */
function finishCourses(n: Date) {
  const s0 = store.get()
  const ended = s0.medicines.filter((m) => {
    if ((m.status !== 'active' && m.status !== 'paused') || m.duration !== 'course') return false
    const end = courseEnd(m, m.timeZone)
    return !!end && localDateKey(n, m.timeZone) > end
  })
  if (!ended.length) return
  for (const m of ended) { saveMedicine({ ...m, status: 'completed' }); resyncMedicine(m.id) }
}

export function createReminder(input: { title: string; when: Date; notes?: string }): Result<{ reminder: Reminder; duplicate: boolean }> {
  const n = now()
  const title = input.title.trim()
  if (!title) return fail('Enter what the reminder is for.')
  if (input.when.getTime() <= n.getTime()) return fail('Pick a time in the future.')
  const s = store.get()
  const r = R.createReminder({ ownerId: OWNER, kind: 'custom', title, notes: input.notes, when: input.when, timeZone: s.profile.timeZone }, n)
  const res = R.addIdempotent(s.reminders, [r])
  if (res.added.length === 0) {
    const existing = s.reminders.find((x) => x.idempotencyKey === r.idempotencyKey)!
    return ok({ reminder: existing, duplicate: true })
  }
  store.set((st) => ({ ...st, reminders: res.list }))
  return ok({ reminder: r, duplicate: false })
}

export const completeReminder = (id: string, via: 'voice' | 'tap' | 'manual') => mutate(id, (r, n) => R.complete(r, via, n))
export const snoozeReminder = (id: string, minutes: number) => mutate(id, (r, n) => R.snooze(r, minutes, n))
export const rescheduleReminder = (id: string, when: Date, reason = 'user') => mutate(id, (r, n) => R.reschedule(r, when, n, reason))
export const cancelReminder = (id: string) => mutate(id, (r, n) => R.cancel(r, n))
export const skipReminder = (id: string) => mutate(id, (r, n) => R.skip(r, n))
export const declineReminder = (id: string) => mutate(id, (r, n) => R.decline(r, n))
export const answerReminder = (id: string) => mutate(id, (r, n) => R.markAnswered(r, n))
export const editReminder = (id: string, patch: { title?: string; notes?: string }) => mutate(id, (r, n) => R.editReminder(r, patch, n))
export const recordDelivery = (id: string, a: Reminder['deliveryAttempts'][number]) =>
  mutate(id, (r) => ({ ...r, deliveryAttempts: [...r.deliveryAttempts, a] }))

export function cancelSeries(seriesId: string) {
  const n = now()
  store.set((s) => ({
    ...s,
    series: s.series.map((x) => (x.id === seriesId ? { ...x, active: false } : x)),
    reminders: s.reminders.map((r) => (r.seriesId === seriesId && R.isActive(r) && r.status !== 'ringing' ? R.cancel(r, n) : r)),
  }))
}

export function createDailySeries(title: string, localTime: string, notes?: string): Result<string> {
  const s = store.get()
  if (!title.trim()) return fail('Enter what the reminder is for.')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) return fail('Enter a valid time.')
  const id = newId('ser')
  store.set((st) => ({
    ...st,
    series: [...st.series, { id, ownerId: OWNER, kind: 'custom', title: title.trim(), notes, localTime, timeZone: s.profile.timeZone, active: true, startAt: now().toISOString() }],
  }))
  tick()
  return ok(id)
}

/** Test-mode helper: make a reminder due immediately (sets its time to now) and ring it. */
export function triggerReminderNow(id: string): Result<Reminder> {
  const n = now()
  const cur = store.get().reminders.find((r) => r.id === id)
  if (!cur) return fail('That reminder no longer exists.')
  if (cur.status !== 'scheduled' && cur.status !== 'snoozed') return fail(`A ${cur.status} reminder cannot be triggered.`)
  store.set((s) => ({ ...s, reminders: s.reminders.map((r) => (r.id === id ? { ...r, scheduledFor: new Date(n.getTime() - 1000).toISOString(), updatedAt: n.toISOString() } : r)) }))
  const fired = tick()
  const r = store.get().reminders.find((x) => x.id === id)!
  return fired.length ? ok(r) : ok(r)
}

export function advanceClock(minutes: number) {
  store.set((s) => ({ ...s, demo: { ...s.demo, clockOffsetMs: s.demo.clockOffsetMs + minutes * 60000 } }))
  tick()
}
export function resetClock() {
  store.set((s) => ({ ...s, demo: { ...s.demo, clockOffsetMs: 0 } }))
}

// ───────────── medicine stock ─────────────
export interface StockSettings { unit?: string; perDose?: number; dosesPerDay?: number; lowDays?: number; lowPct?: number; leadDays?: number }
const withStock = (m: Medicine, patch: Partial<NonNullable<Medicine['stock']>>): Medicine => ({
  ...m, stock: { unit: 'tablet', perDose: 0, dosesPerDay: 0, ledger: [], ...m.stock, ...patch },
})
/** Set what the person CONFIRMED about use (tablets per dose, warning thresholds). Never inferred from free text. */
export function setStockSettings(medId: string, s: StockSettings): Result<Medicine> {
  const m = getMedicine(medId); if (!m) return fail('That medicine no longer exists.')
  const bad = validateStockInput({ qty: 0, perDose: s.perDose }); if (s.perDose != null && bad) return fail(bad)
  const next = withStock(m, Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as never)
  saveMedicine(next); return ok(next)
}
/** Record how many tablets are on hand when tracking starts, or after buying a refill. Both keep their date and source. */
export function recordStock(medId: string, kind: 'opening' | 'refill', qty: number, source: 'user' | 'count' | 'prescription' = 'user', note?: string): Result<Medicine> {
  const m = getMedicine(medId); if (!m) return fail('That medicine no longer exists.')
  const bad = validateStockInput({ qty }); if (bad) return fail(bad)
  if (!(qty > 0)) return fail('Enter how many tablets you have.')
  const next = withStock(m, {}); next.stock!.ledger = [...next.stock!.ledger, txn(kind, qty, source, now(), note)]
  saveMedicine(next); audit('You', kind === 'refill' ? 'stock_refill' : 'stock_opening', `med=${medId}`); return ok(next)
}
/** "I counted N tablets": adds a correcting entry so the estimate matches what is really there. */
export function recountStock(medId: string, actual: number): Result<Medicine> {
  const m = getMedicine(medId); if (!m) return fail('That medicine no longer exists.')
  const bad = validateStockInput({ qty: actual }); if (bad) return fail(bad)
  const est = estimateStock(m, store.get().reminders, now())
  if (!est.tracked) return fail('Start tracking first by entering how many tablets you have.')
  const diff = Math.round((actual - est.onHand) * 10) / 10
  if (diff === 0) return ok(m)
  const next = withStock(m, {}); next.stock!.ledger = [...next.stock!.ledger, txn(diff > 0 ? 'adjustment' : 'consumed', Math.abs(diff), 'count', now(), 'recount')]
  saveMedicine(next); audit('You', 'stock_recount', `med=${medId}`); return ok(next)
}

// ───────────── readings ─────────────
export function saveReading(r: Omit<Reading, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Reading {
  const n = now().toISOString()
  const existing = r.id ? store.get().readings.find((x) => x.id === r.id) : undefined
  const full: Reading = { ...r, id: r.id ?? newId('rd'), createdAt: existing?.createdAt ?? n, updatedAt: n }
  store.set((s) => ({ ...s, readings: existing ? s.readings.map((x) => (x.id === full.id ? full : x)) : [full, ...s.readings] }))
  return full
}
export const deleteReading = (id: string) => store.set((s) => ({ ...s, readings: s.readings.filter((r) => r.id !== id) }))

// ───────────── appointments ─────────────
export interface AppointmentInput { id?: string; title: string; doctor?: string; at: Date; notes?: string; reminder: Appointment['reminder'] }

function appointmentReminderTime(at: Date, kind: Appointment['reminder'], tz: string): Date | null {
  if (kind === 'none') return null
  if (kind === '1h') return new Date(at.getTime() - 3600_000)
  if (kind === '1d') return new Date(at.getTime() - 86400_000)
  return localTimeToUtc(at, -1, '18:00', tz) // evening before, 6 PM local
}

export function saveAppointment(i: AppointmentInput): Result<Appointment> {
  const n = now()
  const s = store.get()
  const tz = s.profile.timeZone
  if (!i.title.trim()) return fail('Enter a title for the appointment.')
  if (Number.isNaN(i.at.getTime())) return fail('Choose a date and time.')
  const existing = i.id ? s.appointments.find((a) => a.id === i.id) : undefined
  if (!existing && i.at.getTime() <= n.getTime()) return fail('Choose a date and time in the future.')
  const remAt = appointmentReminderTime(i.at, i.reminder, tz)
  if (remAt && remAt.getTime() <= n.getTime()) return fail('That reminder time has already passed. Choose a shorter reminder or a later appointment.')
  const id = i.id ?? newId('apt')
  let reminderId = existing?.reminderId
  let reminders = s.reminders
  if (reminderId) reminders = reminders.map((r) => (r.id === reminderId && R.isActive(r) ? R.cancel(r, n) : r))
  reminderId = undefined
  if (remAt) {
    const rem = R.createReminder({
      ownerId: OWNER, kind: 'appointment', title: `${i.title.trim()} — ${fmtDayTime(i.at.toISOString(), n, tz)}`, notes: i.notes, when: remAt, timeZone: tz,
      appointmentId: id, idempotencyKey: `apt:${id}:${i.at.toISOString()}:${i.reminder}`,
    }, n)
    reminders = R.addIdempotent(reminders, [rem]).list
    reminderId = rem.id
  }
  const apt: Appointment = {
    id, title: i.title.trim(), doctor: i.doctor?.trim() || undefined, at: i.at.toISOString(), timeZone: tz, notes: i.notes?.trim() || undefined,
    reminder: i.reminder, reminderId, status: 'upcoming', createdAt: existing?.createdAt ?? n.toISOString(), updatedAt: n.toISOString(),
  }
  store.set((st) => ({ ...st, reminders, appointments: existing ? st.appointments.map((a) => (a.id === id ? apt : a)) : [...st.appointments, apt] }))
  return ok(apt)
}

export function cancelAppointment(id: string) {
  const n = now()
  store.set((s) => {
    const a = s.appointments.find((x) => x.id === id)
    return {
      ...s,
      appointments: s.appointments.map((x) => (x.id === id ? { ...x, status: 'cancelled' as const, updatedAt: n.toISOString() } : x)),
      reminders: s.reminders.map((r) => (a?.reminderId === r.id && R.isActive(r) ? R.cancel(r, n) : r)),
    }
  })
}

// ───────────── family ─────────────
const INVITE_ORIGIN = () => (typeof location !== 'undefined' ? location.origin : 'https://smaran.example')

export function createInvite(relation = 'Family member') {
  const s = store.get()
  const pending = s.family.invites.find((i) => i.status === 'pending')
  if (pending) return pending
  const code = Array.from({ length: 8 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('')
  const inv = {
    id: newId('inv'), code, url: `${INVITE_ORIGIN()}/#join/${code}`, createdAt: now().toISOString(),
    status: 'pending' as const, relation, permissions: { ...s.family.defaultPermissions },
  }
  store.set((st) => ({
    ...st,
    family: { ...st.family, invites: [inv, ...st.family.invites], members: [...st.family.members, { id: newId('fam'), name: 'Invited family member', relation, role: 'helper', status: 'pending', permissions: inv.permissions, inviteId: inv.id, simulated: false }] },
  }))
  audit('You', 'invite_created', `Created invitation ${code}`)
  return inv
}

export function setInvitePermission(inviteId: string, key: keyof Permissions, value: boolean) {
  store.set((s) => ({
    ...s,
    family: {
      ...s.family,
      defaultPermissions: { ...s.family.defaultPermissions, [key]: value },
      invites: s.family.invites.map((i) => (i.id === inviteId ? { ...i, permissions: { ...i.permissions, [key]: value } } : i)),
      members: s.family.members.map((m) => (m.inviteId === inviteId ? { ...m, permissions: { ...m.permissions, [key]: value } } : m)),
    },
  }))
  audit('You', 'permission_changed', `${key} → ${value ? 'allowed' : 'not allowed'}`)
}
export function setMemberPermission(memberId: string, key: keyof Permissions, value: boolean) {
  const m = store.get().family.members.find((x) => x.id === memberId)
  store.set((s) => ({ ...s, family: { ...s.family, members: s.family.members.map((x) => (x.id === memberId ? { ...x, permissions: { ...x.permissions, [key]: value } } : x)) } }))
  audit('You', 'permission_changed', `${m?.name ?? 'Member'}: ${key} → ${value ? 'allowed' : 'not allowed'}`)
}
export function setDefaultPermission(key: keyof Permissions, value: boolean) {
  store.set((s) => ({ ...s, family: { ...s.family, defaultPermissions: { ...s.family.defaultPermissions, [key]: value } } }))
  audit('You', 'default_permission_changed', `${key} → ${value ? 'allowed' : 'not allowed'}`)
}

/** Demo only: nobody is actually contacted. Marks the pending invite as accepted by a local test member. */
export function simulateInviteAccepted(name = 'Anita Kumar', relation = 'Daughter') {
  store.set((s) => {
    const inv = s.family.invites.find((i) => i.status === 'pending')
    const members: FamilyMember[] = s.family.members.some((m) => m.inviteId === inv?.id)
      ? s.family.members.map((m) => (m.inviteId === inv?.id ? { ...m, name, relation, role: 'admin' as const, status: 'active' as const, simulated: true } : m))
      : [...s.family.members, { id: newId('fam'), name, relation, role: 'admin' as const, status: 'active' as const, permissions: { ...s.family.defaultPermissions }, simulated: true }]
    return { ...s, family: { ...s.family, members, invites: s.family.invites.map((i) => (i.id === inv?.id ? { ...i, status: 'accepted' as const } : i)) } }
  })
  audit(name, 'joined_simulated', 'Simulated join for local testing — no other device was contacted')
}

export function addProposal(p: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt' | 'state'> & { state?: Proposal['state'] }) {
  const n = now().toISOString()
  const full: Proposal = { ...p, id: newId('prp'), state: p.state ?? 'draft', createdAt: n, updatedAt: n }
  store.set((s) => ({ ...s, family: { ...s.family, proposals: [...s.family.proposals, full] } }))
  audit(p.by, 'proposal_drafted', p.title)
  return full
}
export function removeProposal(id: string) {
  store.set((s) => ({ ...s, family: { ...s.family, proposals: s.family.proposals.filter((p) => p.id !== id) } }))
}
export function sendProposals(by: string): Result<number> {
  const drafts = store.get().family.proposals.filter((p) => p.state === 'draft')
  if (!drafts.length) return fail('There are no draft changes to send.')
  const n = now().toISOString()
  store.set((s) => ({ ...s, family: { ...s.family, proposals: s.family.proposals.map((p) => (p.state === 'draft' ? { ...p, state: 'awaiting' as const, updatedAt: n } : p)) } }))
  audit(by, 'proposals_sent', `${drafts.length} change(s) sent for confirmation (stored locally; no other device was notified)`)
  return ok(drafts.length)
}
export function decideProposals(approve: boolean): Result<number> {
  const s0 = store.get()
  const waiting = s0.family.proposals.filter((p) => p.state === 'awaiting')
  if (!waiting.length) return fail('There are no changes waiting for your decision.')
  const n = now()
  const tz = s0.profile.timeZone
  if (approve) {
    store.set((s) => {
      let medicines = s.medicines
      for (const p of waiting) {
        if (p.kind === 'change' && p.medicineId && p.patch) medicines = medicines.map((m) => (m.id === p.medicineId ? { ...m, ...p.patch } : m))
        if (p.kind === 'new' && p.newMedicine) medicines = [...medicines, { ...p.newMedicine, status: 'active', source: 'family', activatedAt: n.toISOString(), startedOn: localDateKey(n, tz), timeZone: tz }]
      }
      return { ...s, medicines }
    })
    // resync series/reminders for every active medicine touched
    for (const p of waiting) {
      const id = p.kind === 'change' ? p.medicineId : p.newMedicine?.id
      if (id) resyncMedicine(id)
    }
  }
  store.set((s) => ({ ...s, family: { ...s.family, proposals: s.family.proposals.map((p) => (p.state === 'awaiting' ? { ...p, state: approve ? ('approved' as const) : ('declined' as const), updatedAt: n.toISOString() } : p)) } }))
  audit('You', approve ? 'proposals_approved' : 'proposals_declined', waiting.map((p) => p.title).join(', '))
  return ok(waiting.length)
}

// ───────────── conversation log (summaries only, never raw transcripts unless the user opts in) ─────────────
export function logConversation(outcome: string, summary: string, reminderId?: string) {
  if (!store.get().prefs.conversationSummaries) return
  store.set((s) => ({ ...s, conversation: [{ id: newId('cv'), at: now().toISOString(), reminderId, outcome, summary }, ...s.conversation].slice(0, 100) }))
}

export { displayName, pad }
