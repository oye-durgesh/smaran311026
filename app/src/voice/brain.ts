/**
 * Turns one user utterance into state changes + Sathi's reply. UI- and speech-agnostic so it can be tested.
 * Safety rules: never invents a time/date, never saves a health reading without a spoken/typed "yes",
 * and never claims a medicine was taken unless the user said so (completion is recorded as user-reported).
 */
import type { Lang, Reading } from '../domain/types'
import { parseCommand, describeWhen, type Pending } from '../domain/nlp'
import { validateBp, validateSugar, fmtBp, fmtSugar, type ParsedReading } from '../domain/health'
import { findRelative } from '../domain/nlp'
import { SNOOZE_OPTIONS } from '../domain/reminders'
import { fmtDayTime, toLocalInput } from '../domain/time'
import * as A from '../store/actions'
import { effectiveSettings } from '../domain/people'
import { now, store } from '../store/store'
import { msg, type Line } from './messages'

export type Outcome = 'taken' | 'snoozed' | 'rescheduled' | 'created' | 'cancelled' | 'saved-reading' | 'ended' | 'declined'

export interface Convo {
  reminderId?: string
  pending?: Pending | null
  confirm?: { kind: 'health'; reading: ParsedReading } | null
  expectSnooze?: boolean
}
export interface BrainResult { line: Line; convo: Convo; end?: Outcome }

const YES = /\b(haan|han|haa|ha|yes|yeah|yep|sahi|theek hai|correct|save kar|kar do)\b|हाँ|हां/
const NO = /\b(nahi|nahin|nai|no|nope|not yet|mat)\b|नहीं|नही/
const TOOK = /\b(le li|le liya|kha li|kha liya|pi li|ho gaya|ho gayi|hogaya|done|taken|took|liya)\b|ले ली|खा ली|हो गया/

function lc(t: string) { return t.toLowerCase() }

function readingToDraft(p: ParsedReading, nowIso: string): Omit<Reading, 'id' | 'createdAt' | 'updatedAt'> {
  return p.type === 'sugar'
    ? { type: 'sugar', at: nowIso, value: p.value, unit: p.unit ?? 'mg/dL', context: p.context ?? 'unspecified', source: 'voice' }
    : { type: 'bp', at: nowIso, systolic: p.systolic, diastolic: p.diastolic, pulse: p.pulse, source: 'voice' }
}
export function validateParsed(p: ParsedReading, n: Date): string | null {
  const at = toLocalInput(n.toISOString(), effectiveSettings(store.get()).timeZone)
  const iso = n.toISOString()
  void at
  if (p.type === 'sugar') {
    const v = validateSugar({ value: String(p.value ?? ''), unit: p.unit ?? 'mg/dL', context: p.context ?? 'unspecified', at: iso, note: '' }, n)
    return v.ok ? null : Object.values(v.errors)[0]
  }
  const v = validateBp({ systolic: String(p.systolic ?? ''), diastolic: String(p.diastolic ?? ''), pulse: p.pulse != null ? String(p.pulse) : '', at: iso, note: '' }, n)
  return v.ok ? null : Object.values(v.errors)[0]
}

export function handleUtterance(text: string, convo: Convo, lang: Lang): BrainResult {
  const s = store.view() // the active person's reminders only
  const n = now()
  const me = effectiveSettings(s)
  const tz = me.timeZone
  const t = lc(text)
  const callName = me.address
  const active = convo.reminderId ? s.reminders.find((r) => r.id === convo.reminderId) : undefined
  const activeOpen = active && (active.status === 'ringing' || active.status === 'declined' || active.status === 'snoozed') ? active : undefined

  // 1) confirming a health reading
  if (convo.confirm) {
    const r = convo.confirm.reading
    if (YES.test(t) && !NO.test(t)) {
      const bad = validateParsed(r, n)
      if (bad) return { line: msg(lang, 'healthBad', { why: bad }), convo: { ...convo, confirm: null } }
      A.saveReading(readingToDraft(r, n.toISOString()))
      return { line: msg(lang, 'healthSaved'), convo: { ...convo, confirm: null }, end: 'saved-reading' }
    }
    if (NO.test(t)) return { line: msg(lang, 'healthDiscard'), convo: { ...convo, confirm: null } }
    return { line: msg(lang, 'healthAsk', { what: r.type === 'sugar' ? `${r.value} ${r.unit ?? 'mg/dL'}` : `${r.systolic}/${r.diastolic}` }), convo }
  }

  // 2) after "not yet", wait for 5 / 10 / 15
  if (convo.expectSnooze && activeOpen) {
    const rel = findRelative(t)
    const bare = /^\s*(\d{1,2})\s*(min|minute|minutes)?\s*$/.exec(t)
    const m = rel?.minutes ?? (bare ? +bare[1] : NaN)
    if ((SNOOZE_OPTIONS as readonly number[]).includes(m)) {
      const res = A.snoozeReminder(activeOpen.id, m)
      if (res.ok) return { line: msg(lang, 'snoozed', { min: String(m) }), convo: { ...convo, expectSnooze: false }, end: 'snoozed' }
    }
    return { line: msg(lang, 'notYet'), convo }
  }

  // 3) the reminder call's own question: "Did you take it?"
  if (activeOpen && activeOpen.kind === 'medicine' && !convo.pending) {
    const rel = findRelative(t)
    if (TOOK.test(t) || (YES.test(t) && !NO.test(t) && !rel)) {
      const res = A.completeReminder(activeOpen.id, 'voice')
      if (res.ok) return { line: msg(lang, 'taken'), convo, end: 'taken' }
    } else if (NO.test(t) && !rel) {
      return { line: msg(lang, 'notYet'), convo: { ...convo, expectSnooze: true } }
    }
  }

  // 4) general commands
  const intent = parseCommand(text, { now: n, tz, active: activeOpen ?? null, reminders: s.reminders, pending: convo.pending })
  switch (intent.type) {
    case 'complete': {
      if (!activeOpen) return { line: msg(lang, 'noneActive'), convo }
      const res = A.completeReminder(activeOpen.id, 'voice')
      return res.ok ? { line: msg(lang, 'taken'), convo, end: 'taken' } : { line: msg(lang, 'unknown'), convo }
    }
    case 'snooze': {
      if (!activeOpen) return { line: msg(lang, 'noneActive'), convo }
      const res = A.snoozeReminder(activeOpen.id, intent.minutes)
      return res.ok ? { line: msg(lang, 'snoozed', { min: String(intent.minutes) }), convo, end: 'snoozed' } : { line: msg(lang, 'unknown'), convo }
    }
    case 'reschedule': {
      const id = intent.target ?? activeOpen?.id
      if (!id) return { line: msg(lang, 'noneActive'), convo: { ...convo, pending: null } }
      const res = A.rescheduleReminder(id, intent.when, 'voice')
      return res.ok
        ? { line: msg(lang, 'rescheduled', { when: describeWhen(intent.when, n, tz) }), convo: { ...convo, pending: null }, end: 'rescheduled' }
        : { line: { text: res.error, say: res.error }, convo: { ...convo, pending: null } }
    }
    case 'create': {
      const res = A.createReminder({ title: intent.title, when: intent.when })
      if (!res.ok) return { line: { text: res.error, say: res.error }, convo: { ...convo, pending: null } }
      const when = describeWhen(intent.when, n, tz)
      return {
        line: msg(lang, res.value.duplicate ? 'duplicate' : 'created', { title: intent.title, when }),
        convo: { ...convo, pending: null }, end: res.value.duplicate ? undefined : 'created',
      }
    }
    case 'cancel': {
      if (!activeOpen) return { line: msg(lang, 'noneActive'), convo }
      const res = A.cancelReminder(activeOpen.id)
      return res.ok ? { line: msg(lang, 'cancelled'), convo, end: 'cancelled' } : { line: msg(lang, 'unknown'), convo }
    }
    case 'list': {
      const up = s.reminders.filter((r) => r.status === 'scheduled' || r.status === 'snoozed' || r.status === 'ringing' || r.status === 'declined')
        .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
      const scoped = intent.scope === 'today' ? up.filter((r) => fmtDayTime(r.scheduledFor, n, tz).startsWith('Today')) : up
      if (!scoped.length) return { line: msg(lang, 'listEmpty'), convo }
      const items = scoped.slice(0, 4).map((r) => `${r.title}, ${fmtDayTime(r.scheduledFor, n, tz)}`).join('; ')
      const more = scoped.length > 4 ? ` (+${scoped.length - 4})` : ''
      return { line: msg(lang, 'listIntro', { n: String(scoped.length), items: items + more }), convo }
    }
    case 'health': {
      const bad = validateParsed(intent.reading, n)
      if (bad) return { line: msg(lang, 'healthBad', { why: bad }), convo }
      const r = intent.reading
      const what = r.type === 'sugar' ? fmtSugar({ value: r.value, unit: r.unit } as Reading) : fmtBp({ systolic: r.systolic, diastolic: r.diastolic } as Reading)
      return { line: msg(lang, 'healthAsk', { what: `${r.type === 'sugar' ? 'blood sugar' : 'blood pressure'} ${what}` }), convo: { ...convo, confirm: { kind: 'health', reading: r } } }
    }
    case 'clarify':
      return { line: { text: intent.question, say: intent.question }, convo: { ...convo, pending: intent.pending } }
    default:
      return { line: msg(lang, 'unknown'), convo: { ...convo, pending: null } }
  }
}
