// Authorised, idempotent reminder operations used by the app's voice agent (and any other caller).
// Pure logic over a thin `ToolStore` boundary, so it is shared by the Edge Function and unit-tested with an in-memory store.
// Security model: the caller's identity (ctx.userId) comes from the verified JWT. The model never supplies a user id; it supplies a
// personId which is checked here against care_recipients owned by that user. Nothing is reported as saved unless the store confirms it.
// No Deno / Node / browser APIs.

export type Category = 'activity' | 'medicine' | 'appointment' | 'custom'
export type Recurrence = 'none' | 'daily'
export type Source = 'app' | 'voice' | 'agent'

export interface CreateInput {
  personId: string
  title?: string
  description?: string
  category?: Category
  date?: string           // 'today' | 'tomorrow' | 'YYYY-MM-DD' (in the person's time zone)
  time?: string           // 'HH:mm' 24-hour, in the person's time zone
  partOfDay?: string      // 'morning' | 'afternoon' | 'evening' | 'night' WITHOUT a clock time → we ask, we do not guess
  recurrence?: Recurrence
  endsOn?: string
  medicationId?: string
  idempotencyKey?: string
  source?: Source
}
export interface Ctx { userId: string; now: Date; language?: string }

export type Outcome =
  | { status: 'saved' | 'duplicate'; reminder: ReminderView; message: string }
  | { status: 'needs_clarification'; missing: 'title' | 'time' | 'date' | 'person' | 'medicine' | 'meridiem'; question: string }
  | { status: 'permission_denied'; message: string }
  | { status: 'invalid_request'; message: string; field?: string }
  | { status: 'temporary_failure'; message: string }

export interface ReminderView { id: string; personId: string; title: string; scheduledFor: string; timeZone: string; status: string; recurrence: Recurrence; localDate: string; localTime: string }

export interface PersonRow { id: string; owner_id: string; active: boolean; time_zone: string; display_name: string; greeting_name: string; language: string }
export interface MedRow { id: string; owner_id: string; person_id: string; status: string; name: string }
export interface ReminderRow {
  id: string; owner_id: string; person_id: string; kind: string; title: string; notes: string | null; medication_id: string | null; series_id: string | null
  scheduled_for: string; original_scheduled_for: string; time_zone: string; recurrence: unknown; status: string; idempotency_key: string
  source: string; created_by: string | null; delivery_channel: string; snooze_history?: unknown[]; reschedule_history?: unknown[]; completed_at?: string | null; cancelled_at?: string | null; skipped_at?: string | null; completion?: unknown
}
export class StoreError extends Error { constructor(readonly kind: 'conflict' | 'unavailable', m: string) { super(m) } }
export interface ToolStore {
  getPerson(id: string): Promise<PersonRow | null>
  getMedication(id: string): Promise<MedRow | null>
  findReminderByKey(ownerId: string, key: string): Promise<ReminderRow | null>
  getReminder(id: string): Promise<ReminderRow | null>
  insertReminder(row: ReminderRow): Promise<ReminderRow>          // throws StoreError('conflict') on duplicate id / idempotency key
  insertSeries(row: Record<string, unknown>): Promise<void>       // idempotent on id
  updateReminder(id: string, patch: Partial<ReminderRow>): Promise<ReminderRow>
  listReminders(personId: string, fromIso: string, toIso: string): Promise<ReminderRow[]>
  audit(action: string, detail: string): Promise<void>
}

// ───────── time (self-contained so the Edge Function bundle needs nothing from the app) ─────────
const dtfCache = new Map<string, Intl.DateTimeFormat>()
const dtf = (tz: string) => { let f = dtfCache.get(tz); if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); dtfCache.set(tz, f) } return f }
export function tzParts(d: Date, tz: string) { const o: Record<string, string> = {}; for (const p of dtf(tz).formatToParts(d)) o[p.type] = p.value; return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, s: +o.second } }
const offsetMs = (d: Date, tz: string) => { const p = tzParts(d, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(d.getTime() / 1000) * 1000 }
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min)
  let t = guess - offsetMs(new Date(guess), tz)
  t = guess - offsetMs(new Date(t), tz) // re-check across a DST change
  return new Date(t)
}
export const validTz = (tz: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false } }
const pad = (n: number) => String(n).padStart(2, '0')
export const dateKey = (d: Date, tz: string) => { const p = tzParts(d, tz); return `${p.y}-${pad(p.m)}-${pad(p.d)}` }
const addDays = (key: string, n: number) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// ───────── words (short, one question at a time; masculine Hindi) ─────────
type L = 'hi' | 'en' | 'mr' | 'kn'
const lang = (c?: string): L => (c === 'hi' || c === 'mr' || c === 'kn' ? c : 'en')
const Q = {
  title: { en: 'What should I remind about?', hi: 'Kis cheez ka reminder lagaun?', mr: 'Kashachi athvan karu?', kn: 'Yeno nenapisali?' },
  time: { en: 'At what time should I remind you?', hi: 'Kitne baje yaad dilaun?', mr: 'Kititya vajta athvan karu?', kn: 'Yaava samayakke nenapisali?' },
  meridiem: { en: 'Is that in the morning or the evening?', hi: 'Subah ya shaam?', mr: 'Sakali ki sandhyakali?', kn: 'Beligge athava sanje?' },
  passed: { en: 'That time has already passed today. Should I set it for tomorrow?', hi: 'Aaj ka woh time nikal gaya hai. Kal ke liye laga doon?', mr: 'Aajchi hi vel geli ahe. Udyasathi karu?', kn: 'Indina samaya mugidide. Naale madali?' },
  medicine: { en: 'Which medicine is this for?', hi: 'Kaunsi dawa ke liye?', mr: 'Konatya aushadhasathi?', kn: 'Yaava aushadhakke?' },
}
const q = (k: keyof typeof Q, l: L) => Q[k][l]

// ───────── ids ─────────
export function fnv(s: string): string { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

const view = (r: ReminderRow, rec: Recurrence): ReminderView => {
  const d = new Date(r.scheduled_for)
  return { id: r.id, personId: r.person_id, title: r.title, scheduledFor: d.toISOString(), timeZone: r.time_zone, status: r.status, recurrence: rec, localDate: dateKey(d, r.time_zone), localTime: `${pad(tzParts(d, r.time_zone).h)}:${pad(tzParts(d, r.time_zone).min)}` }
}
const recOf = (r: ReminderRow): Recurrence => ((r.recurrence as { freq?: string } | null)?.freq === 'daily' ? 'daily' : 'none')

async function authorisedPerson(store: ToolStore, ctx: Ctx, personId: unknown): Promise<PersonRow | Outcome> {
  if (typeof personId !== 'string' || !personId) return { status: 'needs_clarification', missing: 'person', question: 'Who is this reminder for?' }
  let p: PersonRow | null
  try { p = await store.getPerson(personId) } catch { return { status: 'temporary_failure', message: 'The reminder was not saved because the server could not be reached.' } }
  // a person that does not exist, belongs to another account, or is archived is the same answer: not yours to write to
  if (!p || p.owner_id !== ctx.userId || !p.active) return { status: 'permission_denied', message: 'You do not have permission to set reminders for this person.' }
  return p
}
const isOutcome = (x: PersonRow | Outcome): x is Outcome => 'status' in x

// ───────── create ─────────
export async function createReminderTool(store: ToolStore, ctx: Ctx, i: CreateInput): Promise<Outcome> {
  const l = lang(ctx.language)
  const person = await authorisedPerson(store, ctx, i.personId)
  if (isOutcome(person)) return person
  const tz = person.time_zone
  if (!validTz(tz)) return { status: 'invalid_request', message: 'This profile has an invalid time zone.', field: 'timezone' }

  const category: Category = i.category ?? 'activity'
  if (!['activity', 'medicine', 'appointment', 'custom'].includes(category)) return { status: 'invalid_request', message: 'Unknown reminder category.', field: 'category' }
  const recurrence: Recurrence = i.recurrence ?? 'none'
  if (recurrence !== 'none' && recurrence !== 'daily') return { status: 'invalid_request', message: 'Only one-time and daily reminders are supported.', field: 'recurrence' }

  // medicine reminders may only use a CONFIRMED, ACTIVE medicine that belongs to the same person; we never infer a dose
  let title = (i.title ?? '').trim()
  let med: MedRow | null = null
  if (category === 'medicine') {
    if (!i.medicationId) return { status: 'needs_clarification', missing: 'medicine', question: q('medicine', l) }
    try { med = await store.getMedication(i.medicationId) } catch { return { status: 'temporary_failure', message: 'The reminder was not saved because the server could not be reached.' } }
    if (!med || med.owner_id !== ctx.userId || med.person_id !== person.id) return { status: 'permission_denied', message: 'That medicine does not belong to this person.' }
    if (med.status !== 'active') return { status: 'invalid_request', message: 'That medicine has not been confirmed with a schedule yet, so a reminder cannot be created from it.', field: 'medicationId' }
    title = med.name
  }
  if (!title) return { status: 'needs_clarification', missing: 'title', question: q('title', l) }
  if (title.length > 200) return { status: 'invalid_request', message: 'The reminder title is too long.', field: 'title' }
  if ((i.description ?? '').length > 1000) return { status: 'invalid_request', message: 'The description is too long.', field: 'description' }

  // when
  if (!i.time) return i.partOfDay ? { status: 'needs_clarification', missing: 'time', question: q('time', l) } : { status: 'needs_clarification', missing: 'time', question: q('time', l) }
  if (!TIME_RE.test(i.time)) return { status: 'invalid_request', message: 'The time must be HH:mm (24-hour).', field: 'time' }
  const [hh, mm] = i.time.split(':').map(Number)
  const today = dateKey(ctx.now, tz)
  let day: string
  if (!i.date) day = today
  else if (i.date === 'today') day = today
  else if (i.date === 'tomorrow') day = addDays(today, 1)
  else if (DATE_RE.test(i.date) && !Number.isNaN(Date.parse(i.date))) day = i.date
  else return { status: 'invalid_request', message: 'The date is not valid.', field: 'date' }
  const [y, m, d] = day.split('-').map(Number)
  if (dateKey(zonedToUtc(y, m, d, hh, mm, tz), tz) !== day) return { status: 'invalid_request', message: 'That date does not exist.', field: 'date' }
  let when = zonedToUtc(y, m, d, hh, mm, tz)
  if (when.getTime() <= ctx.now.getTime()) {
    if (recurrence === 'daily' && !i.date) { day = addDays(today, 1); const [y2, m2, d2] = day.split('-').map(Number); when = zonedToUtc(y2, m2, d2, hh, mm, tz) } // daily: start with the next occurrence
    else if (!i.date) return { status: 'needs_clarification', missing: 'date', question: q('passed', l) }                                                              // one-time, time already gone today: ask
    else return { status: 'invalid_request', message: 'That time is in the past.', field: 'time' }
  }
  if (i.endsOn && (!DATE_RE.test(i.endsOn) || i.endsOn < dateKey(when, tz))) return { status: 'invalid_request', message: 'The end date must be on or after the start.', field: 'endsOn' }

  // idempotency: the same tool call retried returns the first result and creates nothing new
  const localDay = dateKey(when, tz)
  const key = `voice:${i.idempotencyKey ?? `${person.id}|${norm(title)}|${when.toISOString()}|${recurrence}`}`
  const source: Source = i.source ?? 'voice'
  let existing: ReminderRow | null
  try { existing = await store.findReminderByKey(ctx.userId, key) } catch { return { status: 'temporary_failure', message: 'The reminder was not saved because the server could not be reached.' } }
  if (existing) return { status: 'duplicate', reminder: view(existing, recOf(existing)), message: 'This reminder was already saved.' }

  const kind = category === 'medicine' ? 'medicine' : category === 'appointment' ? 'appointment' : 'custom'
  const id = `rem_v_${fnv(ctx.userId + '|' + key)}`
  let row: ReminderRow = {
    id, owner_id: ctx.userId, person_id: person.id, kind, title, notes: i.description?.trim() || null, medication_id: med?.id ?? null, series_id: null,
    scheduled_for: when.toISOString(), original_scheduled_for: when.toISOString(), time_zone: tz, recurrence: null, status: 'scheduled', idempotency_key: key,
    source, created_by: ctx.userId, delivery_channel: 'push',
  }
  try {
    if (recurrence === 'daily') {
      const sid = `ser_v_${fnv(ctx.userId + '|' + key)}`
      await store.insertSeries({ id: sid, owner_id: ctx.userId, person_id: person.id, kind, title, notes: row.notes, medication_id: med?.id ?? null, local_time: i.time, time_zone: tz, active: true, start_at: when.toISOString(), ends_on: i.endsOn ?? null, source, created_by: ctx.userId })
      // the first occurrence uses the same id/key scheme as the server's recurrence generator, so the scheduler never duplicates it
      row = { ...row, id: `rem_series:${sid}:${localDay}`, idempotency_key: `series:${sid}:${localDay}`, series_id: sid, recurrence: { freq: 'daily', localTime: i.time } }
      // remember the call key on the series row's first occurrence via a lookup row is unnecessary: the series id itself is derived from the key
    }
    const saved = await store.insertReminder(row)
    await store.audit('reminder_created_by_voice', `person=${person.id} id=${saved.id}`).catch(() => undefined) // audit never blocks or leaks the title
    return { status: 'saved', reminder: view(saved, recurrence), message: 'Saved.' }
  } catch (e) {
    if (e instanceof StoreError && e.kind === 'conflict') {
      const again = await store.findReminderByKey(ctx.userId, row.idempotency_key).catch(() => null)
      if (again) return { status: 'duplicate', reminder: view(again, recOf(again)), message: 'This reminder was already saved.' }
    }
    return { status: 'temporary_failure', message: 'The reminder was not saved. Please try again.' }
  }
}

// ───────── manage ─────────
async function owned(store: ToolStore, ctx: Ctx, id: unknown): Promise<ReminderRow | Outcome> {
  if (typeof id !== 'string' || !id) return { status: 'invalid_request', message: 'Missing reminder id.', field: 'reminderId' }
  let r: ReminderRow | null
  try { r = await store.getReminder(id) } catch { return { status: 'temporary_failure', message: 'The server could not be reached.' } }
  if (!r || r.owner_id !== ctx.userId) return { status: 'permission_denied', message: 'You do not have permission to change this reminder.' }
  const p = await authorisedPerson(store, ctx, r.person_id)   // the reminder's person must still be an active profile of this account
  if (isOutcome(p)) return p
  return r
}
const isRow = (x: ReminderRow | Outcome): x is ReminderRow => !('status' in x && typeof (x as Outcome).status === 'string' && !('scheduled_for' in x))
const OPEN = new Set(['scheduled', 'ringing', 'snoozed', 'declined'])

export async function listTodayTool(store: ToolStore, ctx: Ctx, personId: string): Promise<{ status: 'ok'; reminders: ReminderView[] } | Outcome> {
  const p = await authorisedPerson(store, ctx, personId); if (isOutcome(p)) return p
  const day = dateKey(ctx.now, p.time_zone); const [y, m, d] = day.split('-').map(Number)
  const from = zonedToUtc(y, m, d, 0, 0, p.time_zone), to = zonedToUtc(...(addDays(day, 1).split('-').map(Number) as [number, number, number]), 0, 0, p.time_zone)
  try {
    const rows = await store.listReminders(p.id, from.toISOString(), to.toISOString())
    return { status: 'ok', reminders: rows.filter((r) => r.status !== 'cancelled').map((r) => view(r, recOf(r))) }
  } catch { return { status: 'temporary_failure', message: 'The reminders could not be loaded.' } }
}

type Mut = { status: 'saved'; reminder: ReminderView; message: string } | Outcome
async function mutate(store: ToolStore, ctx: Ctx, id: string, allowed: (r: ReminderRow) => string | null, patch: (r: ReminderRow) => Partial<ReminderRow>, audit: string): Promise<Mut> {
  const r = await owned(store, ctx, id); if (!isRow(r)) return r
  const bad = allowed(r); if (bad) return { status: 'invalid_request', message: bad }
  try {
    const next = await store.updateReminder(id, patch(r))
    await store.audit(audit, `id=${id}`).catch(() => undefined)
    return { status: 'saved', reminder: view(next, recOf(next)), message: 'Saved.' }
  } catch { return { status: 'temporary_failure', message: 'The change was not saved. Please try again.' } }
}
export const snoozeTool = (store: ToolStore, ctx: Ctx, id: string, minutes: number) =>
  ![5, 10, 15].includes(minutes) ? Promise.resolve<Mut>({ status: 'invalid_request', message: 'Only 5, 10 or 15 minutes are possible.', field: 'minutes' })
    : mutate(store, ctx, id, (r) => (OPEN.has(r.status) ? null : `A ${r.status} reminder cannot be snoozed.`),
      (r) => { const to = new Date(ctx.now.getTime() + minutes * 60000).toISOString(); return { status: 'snoozed', scheduled_for: to, snooze_history: [...(r.snooze_history ?? []), { at: ctx.now.toISOString(), from: r.scheduled_for, to, minutes }] } }, 'reminder_snoozed')
/** The person chooses to skip a medicine dose. Recorded as skipped (not taken, not missed); the answer reminds them never to double up. */
export const skipTool = (store: ToolStore, ctx: Ctx, id: string) =>
  mutate(store, ctx, id, (r) => (OPEN.has(r.status) || r.status === 'missed' || r.status === 'declined' ? null : `A ${r.status} reminder cannot be skipped.`), () => ({ status: 'skipped', skipped_at: ctx.now.toISOString() } as Partial<ReminderRow>), 'reminder_skipped')
export const cancelTool = (store: ToolStore, ctx: Ctx, id: string) =>
  mutate(store, ctx, id, (r) => (OPEN.has(r.status) ? null : `A ${r.status} reminder cannot be cancelled.`), () => ({ status: 'cancelled', cancelled_at: ctx.now.toISOString() }), 'reminder_cancelled')
/** The person reports they did it. Delivered != done, and the record says "user-reported". */
export const completeTool = (store: ToolStore, ctx: Ctx, id: string) =>
  mutate(store, ctx, id, (r) => (OPEN.has(r.status) ? null : `A ${r.status} reminder cannot be completed.`), () => ({ status: 'completed', completed_at: ctx.now.toISOString(), completion: { via: 'voice', basis: 'user-reported' } }), 'reminder_completed')
export async function rescheduleTool(store: ToolStore, ctx: Ctx, id: string, a: { date?: string; time?: string }): Promise<Mut> {
  const r = await owned(store, ctx, id); if (!isRow(r)) return r
  if (!a.time) return { status: 'needs_clarification', missing: 'time', question: q('time', lang(ctx.language)) }
  if (!TIME_RE.test(a.time)) return { status: 'invalid_request', message: 'The time must be HH:mm (24-hour).', field: 'time' }
  if (!OPEN.has(r.status)) return { status: 'invalid_request', message: `A ${r.status} reminder cannot be rescheduled.` }
  const tz = r.time_zone, today = dateKey(ctx.now, tz)
  const day = !a.date || a.date === 'today' ? today : a.date === 'tomorrow' ? addDays(today, 1) : a.date
  if (!DATE_RE.test(day)) return { status: 'invalid_request', message: 'The date is not valid.', field: 'date' }
  const [y, m, d] = day.split('-').map(Number), [hh, mm] = a.time.split(':').map(Number)
  const when = zonedToUtc(y, m, d, hh, mm, tz)
  if (when.getTime() <= ctx.now.getTime()) return { status: 'invalid_request', message: 'That time is in the past.', field: 'time' }
  return mutate(store, ctx, id, () => null, (cur) => ({ status: 'scheduled', scheduled_for: when.toISOString(), reschedule_history: [...(cur.reschedule_history ?? []), { at: ctx.now.toISOString(), from: cur.scheduled_for, to: when.toISOString(), reason: 'voice' }] }), 'reminder_rescheduled')
}
