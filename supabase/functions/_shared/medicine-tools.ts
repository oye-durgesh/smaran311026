// Live medicine tools for ElevenLabs. Database rows only — never hardcoded names or times.
// Identity comes from a verified tool session. family_member_id from the model is ignored.

import type { ToolAgent, ToolClaims, ToolRel } from './tool-session.ts'
import { relAllowedForAgent } from './tool-session.ts'

export type ToolName =
  | 'get_triggering_dose'
  | 'get_medicine_schedule'
  | 'get_todays_medicine_status'
  | 'get_next_medicine_dose'
  | 'mark_medicine_taken'
  | 'snooze_medicine_reminder'
  | 'get_medicine_history'

export interface MedRow {
  id: string
  owner_id: string
  family_member_id: string
  name: string
  strength: string
  dose: string
  frequency: string
  times: string[]
  food: string
  status: string
  start_date?: string | null
  end_date?: string | null
}

export interface RemRow {
  id: string
  owner_id: string
  family_member_id: string
  medicine_id: string | null
  scheduled_for: string
  original_scheduled_for?: string
  time_zone: string
  status: string
  title?: string
  snooze_history?: unknown[]
  completed_at?: string | null
  skipped_at?: string | null
  completion?: unknown
  idempotency_key?: string
}

export interface MemberRow {
  id: string
  owner_id: string
  relationship: string
  active: boolean
  language: string
  time_zone: string
  display_name: string
}

export interface MedicineStore {
  getMember(ownerId: string, memberId: string): Promise<MemberRow | null>
  listMedicines(ownerId: string, memberId: string): Promise<MedRow[]>
  getMedicine(ownerId: string, id: string): Promise<MedRow | null>
  listReminders(ownerId: string, memberId: string, fromIso: string, toIso: string): Promise<RemRow[]>
  getReminder(ownerId: string, id: string): Promise<RemRow | null>
  upsertReminder(row: RemRow): Promise<RemRow>
}

export type Face = 'upcoming' | 'due' | 'taken' | 'skipped' | 'snoozed' | 'overdue'

export type ToolResult =
  | { ok: true; tool: ToolName; language: string; timezone: string; local_date: string; speak_in: string; [k: string]: unknown }
  | { ok: false; code: 'unavailable' | 'permission_denied' | 'needs_confirmation' | 'needs_clarification' | 'not_found' | 'invalid'; message: string; speak_in?: string }

const FOOD: Record<string, string> = { before: 'Before food', with: 'With food', after: 'After food', none: 'No instruction' }
const FREQ: Record<string, string> = { once: 'Once daily', twice: 'Twice daily', thrice: 'Three times daily', custom: 'Custom' }
const ACTIVE = new Set(['active', 'confirmed', 'ready'])
const OVERDUE_MIN = 120
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const pad = (n: number) => String(n).padStart(2, '0')
const dtfCache = new Map<string, Intl.DateTimeFormat>()
const dtf = (tz: string) => {
  let f = dtfCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    dtfCache.set(tz, f)
  }
  return f
}
export function tzParts(d: Date, tz: string) {
  const o: Record<string, string> = {}
  for (const p of dtf(tz).formatToParts(d)) o[p.type] = p.value
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, s: +o.second }
}
const offsetMs = (d: Date, tz: string) => {
  const p = tzParts(d, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(d.getTime() / 1000) * 1000
}
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min)
  let t = guess - offsetMs(new Date(guess), tz)
  t = guess - offsetMs(new Date(t), tz)
  return new Date(t)
}
export const dateKey = (d: Date, tz: string) => {
  const p = tzParts(d, tz)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}
export const clockOf = (d: Date, tz: string) => {
  const p = tzParts(d, tz)
  return `${pad(p.h)}:${pad(p.min)}`
}
export function speakTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${pad(m)} ${ap}`
}

/** Hindi clock phrasing from any HH:MM. No example times are special-cased. */
const HI_0_59 = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस',
  'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस', 'बीस',
  'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस', 'तीस',
  'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस', 'चालीस',
  'इकतालीस', 'बयालीस', 'तैंतालीस', 'चवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास', 'पचास',
  'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
]
export function speakTimeHi(hhmm: string): string {
  const n = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!n) return hhmm
  const h = Number(n[1])
  const m = Number(n[2])
  if (h > 23 || m > 59) return hhmm
  const part = h < 4 ? 'रात' : h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : h < 20 ? 'शाम' : 'रात'
  const hourW = HI_0_59[h % 12 || 12]
  if (m === 0) return `${part} ${hourW} बजे`
  return `${part} ${hourW} बजकर ${HI_0_59[m]} मिनट`
}

export const occurrenceId = (medicineId: string, date: string, time: string) => `${medicineId}-${date}-${time}`

export function parseOccurrenceId(id: string): { medicineId: string; date: string; time: string } | null {
  const m = id.trim().match(/^(.*)-(\d{4}-\d{2}-\d{2})-([01]\d|2[0-3]):([0-5]\d)$/)
  if (!m) return null
  return { medicineId: m[1], date: m[2], time: `${m[3]}:${m[4]}` }
}

export type OccurrenceCheck =
  | { ok: true; oid: string }
  | { ok: false; code: 'stale' | 'taken' | 'not_found' | 'unavailable' | 'permission_denied' }

/** Bind a reminder call only if the occurrence still matches the live medicine schedule. */
export async function validateCallOccurrence(
  store: MedicineStore,
  ownerId: string,
  memberId: string,
  occurrenceIdRaw: string,
  _now: Date,
): Promise<OccurrenceCheck> {
  const occurrenceId = occurrenceIdRaw.trim()
  if (!occurrenceId || occurrenceId.length > 160) return { ok: false, code: 'not_found' }
  let member: MemberRow | null
  try { member = await store.getMember(ownerId, memberId) } catch { return { ok: false, code: 'unavailable' } }
  if (!member || member.owner_id !== ownerId || member.id !== memberId || !member.active) {
    return { ok: false, code: 'permission_denied' }
  }
  let rem: RemRow | null
  try { rem = await store.getReminder(ownerId, occurrenceId) } catch { return { ok: false, code: 'unavailable' } }
  if (rem && (rem.owner_id !== ownerId || rem.family_member_id !== memberId)) {
    return { ok: false, code: 'permission_denied' }
  }
  const parsed = parseOccurrenceId(occurrenceId)
  const medicineId = rem?.medicine_id || parsed?.medicineId
  if (!medicineId) return { ok: false, code: 'not_found' }
  let med: MedRow | null
  try { med = await store.getMedicine(ownerId, medicineId) } catch { return { ok: false, code: 'unavailable' } }
  if (!med || med.owner_id !== ownerId || med.family_member_id !== memberId) return { ok: false, code: 'not_found' }
  if (!ACTIVE.has(med.status)) return { ok: false, code: 'stale' }
  const tz = rem?.time_zone || member.time_zone || 'Asia/Kolkata'
  const originalClock = parsed?.time
    || (rem?.original_scheduled_for ? clockOf(new Date(rem.original_scheduled_for), tz) : '')
    || (rem ? clockOf(new Date(rem.scheduled_for), tz) : '')
  const times = (med.times ?? []).filter((t) => TIME_RE.test(t))
  if (!originalClock || !times.includes(originalClock)) return { ok: false, code: 'stale' }
  if (rem && ['completed', 'taken'].includes(rem.status)) return { ok: false, code: 'taken' }
  if (rem && ['skipped', 'cancelled', 'declined'].includes(rem.status)) return { ok: false, code: 'stale' }
  return { ok: true, oid: occurrenceId }
}

export function faceOf(status: string, when: Date, now: Date): Face {
  if (status === 'completed' || status === 'taken') return 'taken'
  if (status === 'skipped') return 'skipped'
  if (status === 'cancelled') return 'skipped'
  if (status === 'snoozed') return now.getTime() >= when.getTime() ? 'due' : 'snoozed'
  const late = (now.getTime() - when.getTime()) / 60000
  if (late < 0) return 'upcoming'
  if (late >= OVERDUE_MIN || status === 'missed') return 'overdue'
  return 'due'
}

const unavailable = (): ToolResult => ({
  ok: false, code: 'unavailable',
  message: 'I cannot verify the current schedule right now. Please try again in a moment.',
})

function deny(): ToolResult {
  return { ok: false, code: 'permission_denied', message: 'I cannot access that family member’s medicines.' }
}

export interface ToolCtx {
  claims: ToolClaims
  webhookAgent?: ToolAgent | null
  now: Date
}

function bindOk(ctx: ToolCtx): boolean {
  if (!relAllowedForAgent(ctx.claims.ag, ctx.claims.rel)) return false
  if (ctx.webhookAgent && ctx.webhookAgent !== ctx.claims.ag) return false
  return true
}

function ignoreCallerMemberId(params: Record<string, unknown>, bound: string): boolean {
  const offered = params.family_member_id ?? params.personId ?? params.person_id ?? params.member_id
  if (offered == null || offered === '') return true
  return String(offered) === bound
}

async function scope(store: MedicineStore, ctx: ToolCtx, params: Record<string, unknown>): Promise<
  | { ok: true; member: MemberRow; tz: string; lang: string; day: string }
  | ToolResult
> {
  if (!bindOk(ctx)) return deny()
  if (!ignoreCallerMemberId(params, ctx.claims.mid)) return deny()
  let member: MemberRow | null
  try { member = await store.getMember(ctx.claims.uid, ctx.claims.mid) } catch { return unavailable() }
  if (!member || member.owner_id !== ctx.claims.uid || !member.active) return deny()
  if (member.relationship !== ctx.claims.rel) return deny()
  const tz = member.time_zone || 'Asia/Kolkata'
  const lang = member.language || 'hi'
  return { ok: true, member, tz, lang, day: dateKey(ctx.now, tz) }
}

const isActiveMed = (m: MedRow, day: string) => {
  if (!ACTIVE.has(m.status)) return false
  if (m.start_date && m.start_date > day) return false
  if (m.end_date && m.end_date < day) return false
  return true
}

const foodLabel = (f: string) => FOOD[f] ?? (f || 'No instruction')
const freqLabel = (f: string) => FREQ[f] ?? f

function viewMed(m: MedRow) {
  const times = (m.times ?? []).filter((t) => TIME_RE.test(t))
  return {
    id: m.id,
    name: m.name,
    strength: m.strength,
    dose: m.dose || '1 tablet',
    frequency: freqLabel(m.frequency),
    food: foodLabel(m.food),
    times,
    times_spoken: times.map(speakTime),
    times_spoken_hi: times.map(speakTimeHi),
    status: m.status,
    active: ACTIVE.has(m.status),
  }
}

interface Dose {
  occurrence_id: string
  medicine_id: string
  name: string
  strength: string
  dose: string
  time: string
  time_spoken: string
  time_spoken_hi: string
  status: Face
  scheduled_for: string
}

function doseView(clock: string, extra: Omit<Dose, 'time' | 'time_spoken' | 'time_spoken_hi'>): Dose {
  return { ...extra, time: clock, time_spoken: speakTime(clock), time_spoken_hi: speakTimeHi(clock) }
}

function buildDoses(meds: MedRow[], rems: RemRow[], day: string, tz: string, now: Date): Dose[] {
  const active = meds.filter((m) => isActiveMed(m, day))
  const byId = new Map<string, RemRow>()
  const byOrig = new Map<string, RemRow>()
  for (const r of rems) {
    if (!r.medicine_id) continue
    byId.set(r.id, r)
    const zone = r.time_zone || tz
    const orig = r.original_scheduled_for ? clockOf(new Date(r.original_scheduled_for), zone) : clockOf(new Date(r.scheduled_for), zone)
    byOrig.set(`${r.medicine_id}|${orig}`, r)
  }
  const out: Dose[] = []
  for (const m of active) {
    for (const t of (m.times ?? []).filter((x) => TIME_RE.test(x))) {
      const [hh, mm] = t.split(':').map(Number)
      const [y, mo, d] = day.split('-').map(Number)
      const when = zonedToUtc(y, mo, d, hh, mm, tz)
      const rem = byId.get(occurrenceId(m.id, day, t)) ?? byOrig.get(`${m.id}|${t}`)
      const at = rem ? new Date(rem.scheduled_for) : when
      const clock = rem ? clockOf(at, rem.time_zone || tz) : t
      const status = rem ? faceOf(rem.status, at, now) : faceOf('scheduled', when, now)
      out.push(doseView(clock, {
        occurrence_id: rem?.id ?? occurrenceId(m.id, day, t),
        medicine_id: m.id,
        name: m.name,
        strength: m.strength,
        dose: m.dose || '1 tablet',
        status,
        scheduled_for: at.toISOString(),
      }))
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time))
}

function matchDose(doses: Dose[], params: Record<string, unknown>, boundOid?: string): Dose[] {
  if (boundOid) {
    const parsed = parseOccurrenceId(boundOid)
    return doses.filter((d) =>
      d.occurrence_id === boundOid
      || (parsed != null && d.medicine_id === parsed.medicineId && d.time === parsed.time),
    )
  }
  const oid = typeof params.occurrence_id === 'string' ? params.occurrence_id : ''
  const mid = typeof params.medicine_id === 'string' ? params.medicine_id : ''
  const name = typeof params.medicine_name === 'string' ? params.medicine_name.trim().toLowerCase() : ''
  const time = typeof params.time === 'string' ? params.time : ''
  return doses.filter((d) => {
    if (oid && d.occurrence_id !== oid && occurrenceId(d.medicine_id, d.scheduled_for.slice(0, 10), d.time) !== oid) return false
    if (mid && d.medicine_id !== mid) return false
    if (name && !d.name.toLowerCase().includes(name) && !`${d.name} ${d.strength}`.toLowerCase().includes(name)) return false
    if (time && d.time !== time && d.time_spoken.toLowerCase() !== time.toLowerCase()) return false
    if (!oid && !mid && !name && !time) return false
    return true
  })
}

function publicDose(d: Dose) {
  return {
    occurrence_id: d.occurrence_id,
    medicine_id: d.medicine_id,
    medicine: d.name,
    name: d.name,
    strength: d.strength,
    dose: d.dose,
    time: d.time,
    time_spoken: d.time_spoken,
    time_spoken_hi: d.time_spoken_hi,
    status: d.status,
  }
}

const confirmed = (p: Record<string, unknown>) =>
  p.confirmed === true || p.confirmed === 'true' || p.confirmed === 1 || p.confirmed === '1' || p.confirm === true

export function snoozeMinutes(p: Record<string, unknown>): number {
  const n = Number(p.minutes ?? p.snooze_minutes ?? p.mins)
  return [5, 10, 15].includes(n) ? n : 10
}

async function ensureRem(store: MedicineStore, ctx: ToolCtx, member: MemberRow, dose: Dose, tz: string): Promise<RemRow | ToolResult> {
  const existing = await store.getReminder(ctx.claims.uid, dose.occurrence_id).catch(() => null)
  if (existing && existing.owner_id === ctx.claims.uid && existing.family_member_id === member.id) return existing
  try {
    return await store.upsertReminder({
      id: dose.occurrence_id,
      owner_id: ctx.claims.uid,
      family_member_id: member.id,
      medicine_id: dose.medicine_id,
      scheduled_for: dose.scheduled_for,
      original_scheduled_for: dose.scheduled_for,
      time_zone: tz,
      status: 'scheduled',
      title: dose.name,
      idempotency_key: dose.occurrence_id,
      completion: null,
    })
  } catch {
    return unavailable()
  }
}

const isRem = (x: RemRow | ToolResult): x is RemRow => 'scheduled_for' in x

export async function runMedicineTool(
  store: MedicineStore,
  ctx: ToolCtx,
  name: ToolName,
  params: Record<string, unknown> = {},
): Promise<ToolResult> {
  const scoped = await scope(store, ctx, params)
  if (!('member' in scoped)) return scoped
  const { member, tz, lang, day } = scoped
  const speak = lang === 'en' ? 'English' : lang === 'mr' ? 'Marathi' : lang === 'kn' ? 'Kannada' : 'Hindi'
  const head = { language: lang, timezone: tz, local_date: day, speak_in: speak, relationship: member.relationship as ToolRel }

  let meds: MedRow[]
  let rems: RemRow[]
  try {
    const [y, mo, d] = day.split('-').map(Number)
    const from = zonedToUtc(y, mo, d, 0, 0, tz)
    const to = new Date(from.getTime() + 36 * 3600000)
    meds = await store.listMedicines(ctx.claims.uid, member.id)
    rems = await store.listReminders(ctx.claims.uid, member.id, from.toISOString(), to.toISOString())
  } catch {
    return unavailable()
  }

  const doses = buildDoses(meds, rems, day, tz, ctx.now)
  const boundOid = ctx.claims.oid
  const triggerHits = boundOid ? matchDose(doses, {}, boundOid) : []
  const trigger = triggerHits.length === 1 ? triggerHits[0] : undefined
  const staleBound = !!boundOid && !trigger

  if (name === 'get_triggering_dose') {
    if (!boundOid) {
      const next = doses.find((d) => d.status === 'due' || d.status === 'overdue' || d.status === 'snoozed')
        ?? doses.find((d) => d.status === 'upcoming')
      return {
        ok: true, tool: name, ...head,
        trigger: next ? publicDose(next) : null,
        note: next ? 'No reminder was bound to this call. This is the current pending dose from the database.' : 'No pending dose is on the current schedule.',
      }
    }
    if (staleBound || !trigger) {
      return {
        ok: false, code: 'not_found', speak_in: speak,
        message: 'This reminder is no longer on the current schedule. I will not announce a medicine or time.',
      }
    }
    if (trigger.status === 'taken' || trigger.status === 'skipped') {
      return {
        ok: false, code: 'not_found', speak_in: speak,
        message: 'This dose is already recorded. I will not announce it as due.',
      }
    }
    return {
      ok: true, tool: name, ...head,
      trigger: publicDose(trigger),
      note: `Speak the time as ${trigger.time_spoken_hi} (${trigger.time}). Use only this database occurrence.`,
    }
  }

  if (name === 'get_medicine_schedule') {
    return {
      ok: true, tool: name, ...head,
      medicines: meds.filter((m) => isActiveMed(m, day)).map(viewMed),
      note: 'These are the current database records. Do not add or invent medicines.',
    }
  }

  if (name === 'get_todays_medicine_status') {
    return { ok: true, tool: name, ...head, doses }
  }

  if (name === 'get_next_medicine_dose') {
    if (staleBound) {
      return {
        ok: false, code: 'not_found', speak_in: speak,
        message: 'This reminder is no longer on the current schedule. I will not announce a medicine or time.',
      }
    }
    const next = trigger ?? doses.find((d) => d.status === 'due' || d.status === 'overdue' || d.status === 'snoozed' || d.status === 'upcoming')
    return {
      ok: true, tool: name, ...head,
      next: next ? publicDose(next) : null,
      bound_to_trigger: !!trigger,
    }
  }

  if (name === 'get_medicine_history') {
    const hist = rems
      .filter((r) => ['completed', 'taken', 'skipped', 'missed'].includes(r.status))
      .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for))
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        medicine_id: r.medicine_id,
        title: r.title,
        time: clockOf(new Date(r.scheduled_for), r.time_zone || tz),
        time_spoken: speakTime(clockOf(new Date(r.scheduled_for), r.time_zone || tz)),
        time_spoken_hi: speakTimeHi(clockOf(new Date(r.scheduled_for), r.time_zone || tz)),
        status: faceOf(r.status, new Date(r.scheduled_for), ctx.now),
        at: r.completed_at || r.skipped_at || r.scheduled_for,
      }))
    return { ok: true, tool: name, ...head, history: hist }
  }

  if (name === 'mark_medicine_taken' || name === 'snooze_medicine_reminder') {
    if (staleBound) {
      return { ok: false, code: 'not_found', speak_in: speak, message: 'This reminder is no longer on the current schedule.' }
    }
    const hits = matchDose(doses, params, boundOid)
    if (!hits.length) return { ok: false, code: 'not_found', message: 'I could not match that to a scheduled dose. Please say the medicine name and time.', speak_in: speak }
    if (hits.length > 1) return { ok: false, code: 'needs_clarification', message: 'More than one dose matches. Which medicine and which time?', speak_in: speak }
    const d = hits[0]
    if (d.status === 'taken' || d.status === 'skipped') {
      return { ok: false, code: 'invalid', speak_in: speak, message: 'That dose is already recorded.' }
    }
    if (!confirmed(params)) {
      return {
        ok: false, code: 'needs_confirmation', speak_in: speak,
        message: `Please confirm: mark ${d.name} ${d.strength} at ${d.time_spoken_hi} (${d.time}) as ${name === 'mark_medicine_taken' ? 'taken' : 'snoozed'}?`,
        occurrence_id: d.occurrence_id,
      }
    }
    const rem = await ensureRem(store, ctx, member, d, tz)
    if (!isRem(rem)) return rem
    if (rem.owner_id !== ctx.claims.uid || rem.family_member_id !== member.id) return deny()
    try {
      if (name === 'mark_medicine_taken') {
        const saved = await store.upsertReminder({
          ...rem,
          status: 'completed',
          completed_at: ctx.now.toISOString(),
          completion: { via: 'voice', basis: 'user-reported', confirmed: true },
        })
        const dose = publicDose({ ...d, status: 'taken' })
        return {
          ok: true, tool: name, ...head, dose, reminder_id: saved.id,
          message: `${d.name} ${d.strength} at ${d.time_spoken_hi} (${d.time}) is recorded as taken, as you confirmed.`,
        }
      }
      const minutes = snoozeMinutes(params)
      const until = new Date(ctx.now.getTime() + minutes * 60000)
      const saved = await store.upsertReminder({
        ...rem,
        status: 'snoozed',
        scheduled_for: until.toISOString(),
        snooze_history: [...(rem.snooze_history ?? []), { at: ctx.now.toISOString(), minutes, to: until.toISOString() }],
      })
      const clock = clockOf(until, tz)
      return {
        ok: true, tool: name, ...head,
        dose: publicDose({ ...d, status: 'snoozed', time: clock, time_spoken: speakTime(clock), time_spoken_hi: speakTimeHi(clock), scheduled_for: until.toISOString() }),
        snoozed_until: until.toISOString(),
        snooze_minutes: minutes,
        reminder_id: saved.id,
        message: `${d.name} is snoozed for ${minutes} minutes. Next reminder is ${speakTimeHi(clock)} (${clock}).`,
      }
    } catch {
      return unavailable()
    }
  }

  return { ok: false, code: 'invalid', message: 'Unknown tool.' }
}

/** Edge writes must not invent schedule_id; a fake id fails the medicine_schedules FK. */
export function reminderUpsertPayload(row: RemRow) {
  return {
    id: row.id,
    owner_id: row.owner_id,
    family_member_id: row.family_member_id,
    kind: 'medicine' as const,
    title: row.title || 'Medicine reminder',
    medicine_id: row.medicine_id,
    schedule_id: null as string | null,
    scheduled_for: row.scheduled_for,
    original_scheduled_for: row.original_scheduled_for || row.scheduled_for,
    time_zone: row.time_zone,
    status: row.status,
    snooze_history: row.snooze_history ?? [],
    completed_at: row.completed_at ?? null,
    skipped_at: row.skipped_at ?? null,
    completion: row.completion ?? null,
    idempotency_key: row.idempotency_key || row.id,
  }
}

export const MEDICINE_TOOL_NAMES: ToolName[] = [
  'get_triggering_dose',
  'get_medicine_schedule',
  'get_todays_medicine_status',
  'get_next_medicine_dose',
  'mark_medicine_taken',
  'snooze_medicine_reminder',
  'get_medicine_history',
]
