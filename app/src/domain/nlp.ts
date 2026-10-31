/**
 * Deterministic parser for English / Hindi (Devanagari + romanised) / Hinglish reminder commands.
 * It never guesses: ambiguous times or dates produce a `clarify` intent with a question and a `pending`
 * state that the next utterance can complete. Recognition quality itself depends on the speech engine.
 */
import type { Reminder } from './types'
import { addLocalDays, fmtDayRel, fmtHM, localDateKey, localTimeToUtc, pad, tzParts } from './time'
import { SNOOZE_OPTIONS } from './reminders'
import { parseReadingText, type ParsedReading } from './health'

export interface Pending {
  intent: 'create' | 'reschedule'
  title?: string
  targetId?: string
  dayOffset?: number
  weekday?: number
  period?: 'am' | 'pm' | 'night' | null
  hour?: number
  minute?: number
  ampm?: 'am' | 'pm' | null
}

export interface NlpContext {
  now: Date
  tz: string
  active?: Reminder | null
  reminders?: Reminder[]
  pending?: Pending | null
}

export type Intent =
  | { type: 'create'; title: string; when: Date }
  | { type: 'list'; scope: 'upcoming' | 'today' | 'all' }
  | { type: 'complete'; target?: string }
  | { type: 'snooze'; minutes: 5 | 10 | 15 }
  | { type: 'reschedule'; when: Date; target?: string; relativeMinutes?: number }
  | { type: 'cancel'; target?: string }
  | { type: 'health'; reading: ParsedReading }
  | { type: 'clarify'; question: string; pending: Pending }
  | { type: 'unknown' }

const DEV_DIGITS: Record<string, string> = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' }
const DEV_WORDS: Array<[RegExp, string]> = [
  [/परसों/g, ' parso '], [/मिनट/g, ' minute '], [/घंटे|घण्टे|घंटा|घण्टा/g, ' ghante '], [/बाद/g, ' baad '],
  [/कल/g, ' kal '], [/आज/g, ' aaj '], [/सुबह/g, ' subah '], [/शाम/g, ' shaam '], [/रात/g, ' raat '], [/दोपहर/g, ' dopahar '],
  [/बजे/g, ' baje '], [/याद/g, ' yaad '], [/दिलाना|दिलाओ|दिला/g, ' dilana '], [/हो गया/g, ' ho gaya '], [/हो गई|हो गयी/g, ' ho gayi '],
  [/ले ली/g, ' le li '], [/ले लिया/g, ' le liya '], [/खा ली/g, ' kha li '], [/रिमाइंडर/g, ' reminder '], [/बताओ|बताइए|बताइये/g, ' batao '],
  [/सारे|सभी|सब/g, ' saare '], [/मेरे/g, ' mere '], [/आधे|आधा/g, ' aadha '], [/डेढ़|डेढ/g, ' dedh '], [/रद्द|कैंसिल/g, ' cancel '],
  [/इस/g, ' is '], [/दवा|दवाई/g, ' dawa '], [/को/g, ' ko '], [/कर दो|करदो/g, ' kar do '], [/स्नूज़|स्नूज/g, ' snooze '],
]
const NUM_WORDS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10,
  gyarah: 11, barah: 12, pandrah: 15, bees: 20, tees: 30, paintalis: 45,
}
const NW = Object.keys(NUM_WORDS).join('|')

export function normalize(raw: string): string {
  let t = raw.toLowerCase().replace(/[०-९]/g, (c) => DEV_DIGITS[c])
  for (const [re, to] of DEV_WORDS) t = t.replace(re, to)
  t = t.replace(/[।!?,;"“”]/g, ' ').replace(/\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim()
  return t
}

const WEEKDAYS: Array<[RegExp, number]> = [
  [/\b(sunday|ravivar|itwar|raviwar)\b/, 0], [/\b(monday|somvar|somwar)\b/, 1], [/\b(tuesday|mangalvar|mangalwar)\b/, 2],
  [/\b(wednesday|budhvar|budhwar)\b/, 3], [/\b(thursday|guruvar|guruwar|brihaspativar|veervar)\b/, 4],
  [/\b(friday|shukravar|shukrawar)\b/, 5], [/\b(saturday|shanivar|shaniwar)\b/, 6],
]

interface RelMatch { minutes: number; text: string }
export function findRelative(t: string): RelMatch | null {
  let m: RegExpExecArray | null
  if ((m = /\b(half an hour|aadha ghante|aadha ghanta|adha ghanta|aadha hour)\b(?:\s*(?:baad|later|mein|me))?/.exec(t))) return { minutes: 30, text: m[0] }
  if ((m = /\b(dedh ghante|dedh ghanta|one and a half hours?|1\.5 hours?)\b(?:\s*(?:baad|later|mein|me))?/.exec(t))) return { minutes: 90, text: m[0] }
  if ((m = /\b(an hour|one hour|ek ghante|ek ghanta)\b(?:\s*(?:baad|later|mein|me|from now))?/.exec(t))) return { minutes: 60, text: m[0] }
  const re = new RegExp(`(?:\\bin\\s+)?\\b(\\d+(?:\\.\\d+)?|${NW})\\s*(minutes?|mins?|mnt|ghante|ghanta|hours?|hrs?)\\b(?:\\s*(?:baad|later|mein|me|se|from now))?`)
  if ((m = re.exec(t))) {
    const q = /^\d/.test(m[1]) ? parseFloat(m[1]) : NUM_WORDS[m[1]]
    const mult = /^(minutes?|mins?|mnt)$/.test(m[2]) ? 1 : 60
    return { minutes: Math.round(q * mult), text: m[0] }
  }
  return null
}

type Period = 'am' | 'pm' | 'night' | null
const periodOf = (t: string): { p: Period; text: string } => {
  let m: RegExpExecArray | null
  if ((m = /\b(subah|morning|savere|sawere)\b/.exec(t))) return { p: 'am', text: m[0] }
  if ((m = /\b(dopahar|afternoon|noon)\b/.exec(t))) return { p: 'pm', text: m[0] }
  if ((m = /\b(shaam|sham|evening)\b/.exec(t))) return { p: 'pm', text: m[0] }
  if ((m = /\b(tonight|raat|night)\b/.exec(t))) return { p: 'night', text: m[0] }
  return { p: null, text: '' }
}

interface Clock { hour: number; minute: number; ampm: 'am' | 'pm' | null; text: string; explicit24: boolean }
function findClock(t: string): Clock | null {
  const noRel = t
  let m = /(\d{1,2}):(\d{2})\s*(am|pm|a m|p m)?/.exec(noRel)
  if (m) {
    const ampm = m[3] ? (m[3][0] as 'a' | 'p') === 'a' ? 'am' : 'pm' : null
    return { hour: +m[1], minute: +m[2], ampm, text: m[0], explicit24: !ampm && +m[1] >= 13 }
  }
  m = /\b(\d{1,2})\s*(am|pm|a m|p m)\b/.exec(noRel)
  if (m) return { hour: +m[1], minute: 0, ampm: m[2][0] === 'a' ? 'am' : 'pm', text: m[0], explicit24: false }
  m = new RegExp(`\\b(\\d{1,2}|${NW})\\s*baje\\b`).exec(noRel)
  if (m) return { hour: /^\d/.test(m[1]) ? +m[1] : NUM_WORDS[m[1]], minute: 0, ampm: null, text: m[0], explicit24: false }
  m = /\b(?:at|by|@)\s*(\d{1,2})\b/.exec(noRel)
  if (m) return { hour: +m[1], minute: 0, ampm: null, text: m[0], explicit24: false }
  return null
}

function dayWord(t: string): { off?: number; weekday?: number; text: string } {
  let m: RegExpExecArray | null
  if ((m = /\b(day after tomorrow|parso)\b/.exec(t))) return { off: 2, text: m[0] }
  if ((m = /\b(tomorrow|tmrw|kal)\b/.exec(t))) return { off: 1, text: m[0] }
  if ((m = /\b(today|aaj|tonight)\b/.exec(t))) return { off: 0, text: m[0] }
  for (const [re, d] of WEEKDAYS) if ((m = re.exec(t))) return { weekday: d, text: m[0] }
  return { text: '' }
}

/** Convert a clock + period into 24h. */
function to24(c: { hour: number; minute: number; ampm: 'am' | 'pm' | null }, period: Period): { h: number; nextDay: boolean } | null {
  let h = c.hour
  if (c.minute > 59 || h > 24) return null
  if (c.ampm) {
    if (h < 1 || h > 12) return null
    return { h: c.ampm === 'am' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12), nextDay: false }
  }
  if (h >= 13 || h === 0) return { h: h % 24, nextDay: false }
  if (period === 'am') return { h: h === 12 ? 0 : h, nextDay: false }
  if (period === 'pm') return { h: h === 12 ? 12 : h + 12, nextDay: false }
  if (period === 'night') {
    if (h >= 6 && h <= 11) return { h: h + 12, nextDay: false }
    if (h === 12) return { h: 0, nextDay: true }
    return { h, nextDay: true } // 1–5 at night = early hours of the next day
  }
  return null // 1–12 with no am/pm and no period is ambiguous
}

function fmtClarifyTime(h: number, m: number): string { return fmtHM(`${pad(h)}:${pad(m)}`) }

/** Result of reading a time expression. */
type When =
  | { kind: 'ok'; when: Date; relativeMinutes?: number; used: string[] }
  | { kind: 'clarify'; question: string; pending: Partial<Pending>; used: string[] }
  | { kind: 'none'; used: string[] }

function parseWhen(t: string, ctx: NlpContext, seed?: Pending | null): When {
  const used: string[] = []
  const rel = findRelative(t)
  if (rel && !seed) {
    used.push(rel.text)
    if (rel.minutes <= 0 || rel.minutes > 60 * 24 * 7) return { kind: 'clarify', question: 'Itna time samajh nahi aaya. Kitne minute ya ghante baad?', pending: {}, used }
    return { kind: 'ok', when: new Date(ctx.now.getTime() + rel.minutes * 60000), relativeMinutes: rel.minutes, used }
  }
  const stripped = rel ? t.replace(rel.text, ' ') : t
  const day = dayWord(stripped)
  const per = periodOf(stripped)
  const clock = findClock(stripped)
  if (day.text) used.push(day.text)
  if (per.text) used.push(per.text)
  if (clock) used.push(clock.text)

  let off = day.off ?? seed?.dayOffset
  let weekday = day.weekday ?? seed?.weekday
  let period: Period = per.p ?? seed?.period ?? null
  let c: { hour: number; minute: number; ampm: 'am' | 'pm' | null } | null = clock
    ? { hour: clock.hour, minute: clock.minute, ampm: clock.ampm }
    : seed?.hour != null ? { hour: seed.hour, minute: seed.minute ?? 0, ampm: seed.ampm ?? null } : null
  // Follow-up answers like "subah" or "9 baje" complete a pending question.
  if (!clock && seed && !c) {
    const bare = /^(\d{1,2})$/.exec(stripped.trim())
    if (bare) c = { hour: +bare[1], minute: 0, ampm: null }
  }
  const tonight = /\btonight\b/.test(stripped)
  if (tonight) period = 'night'

  const base: Partial<Pending> = { dayOffset: off, weekday, period }
  if (off === undefined && weekday === undefined && !c && !period) return { kind: 'none', used }

  if (off !== undefined || weekday !== undefined) {
    if (weekday !== undefined && off === undefined) {
      const cur = tzParts(ctx.now, ctx.tz).dow
      off = ((weekday - cur + 7) % 7) || 7
    }
  }
  if (!c) {
    const dayText = off === 0 ? 'aaj' : off === 1 ? 'kal' : 'us din'
    return {
      kind: 'clarify', used,
      question: period ? `${dayText[0].toUpperCase() + dayText.slice(1)} ${period === 'am' ? 'subah' : period === 'night' ? 'raat' : 'shaam/dopahar'} ko kitne baje?` : 'Kitne baje yaad dilau?',
      pending: base,
    }
  }
  const t24 = to24(c, period)
  if (!t24) {
    return {
      kind: 'clarify', used,
      question: `${c.hour} baje — subah (AM) ya shaam/raat (PM)? / Is that ${c.hour} AM or ${c.hour} PM?`,
      pending: { ...base, hour: c.hour, minute: c.minute, ampm: null },
    }
  }
  let dayOff = off ?? 0
  if (t24.nextDay) dayOff += 1
  let when = localTimeToUtc(ctx.now, dayOff, `${pad(t24.h)}:${pad(c.minute)}`, ctx.tz)
  if (when.getTime() <= ctx.now.getTime() + 30000) {
    const label = fmtClarifyTime(t24.h, c.minute)
    const tomorrow = localTimeToUtc(ctx.now, dayOff + 1, `${pad(t24.h)}:${pad(c.minute)}`, ctx.tz)
    return {
      kind: 'clarify', used,
      question: off === undefined
        ? `Aaj ${label} ho chuka hai. Kal ${label} ke liye set karun? / ${label} has already passed today — set it for tomorrow (${fmtDayRel(tomorrow, ctx.now, ctx.tz)})?`
        : `${label} nikal chuka hai. Koi aur time bataiye. / That time has already passed.`,
      pending: off === undefined ? { ...base, dayOffset: 1, hour: c.hour, minute: c.minute, ampm: c.ampm } : base,
    }
  }
  return { kind: 'ok', when, used }
}

const CLEAN_WORDS = [
  /\b(remind me to|remind me|set (a )?reminder( to| for)?|reminder (set|laga|lagao|bana)( do| dena| de)?|please|kindly)\b/g,
  /\b(mujhe|mujhko|mere liye|mera|meri|mere)\b/g,
  /\b(yaad dilana|yaad dila do|yaad dilao|yaad dilado|yaad rakhna|yaad)\b/g,
  /\b(karni hai|karna hai|karne hai|jana hai|jaana hai|leni hai|lena hai|have to|need to|going to|hai|hain)\b/g,
  /\b(kar do|karo|kardo|set kar|set|dena|de do|do)\b/g,
  /\b(ko|ke liye|ki|ka|ke|tak|baad|later|from now|in)\b/g,
]
function cleanTitle(t: string, used: string[]): string {
  let s = ` ${t} `
  for (const u of used) s = s.replace(u, ' ')
  for (const re of CLEAN_WORDS) s = s.replace(re, ' ')
  s = s.replace(/\b(at|by|on)\b/g, ' ').replace(/\s+/g, ' ').replace(/^(to|the)\s+/, '').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

const RE = {
  complete: /\b(ho gaya|ho gayi|hogaya|hogayi|done|le li|le liya|kha li|kha liya|pi li|taken|completed?|mark(ed)? (it |the reminder )?(as )?(done|completed?|taken))\b/,
  list: /\b(batao|dikhao|show|list|what are|kya kya|tell me)\b/,
  cancel: /\b(cancel|delete|remove|hata do|hatao|mat dilana|band kar do)\b/,
  reschedule: /\b(reschedule|postpone|shift|move|badal|change)\b/,
  snooze: /\b(snooze|thodi der|later)\b/,
  create: /\b(yaad dil\w*|remind\w*|reminder|alarm)\b|(karni hai|karna hai|jana hai|jaana hai|leni hai|lena hai|have to|need to)/,
  reminderWord: /\b(reminders?|yaad)\b/,
  all: /\b(saare|sabhi|all|every|mere|my)\b/,
}

/** Find which reminder a command refers to: the ringing one, else a unique title match, else a single open reminder. */
export function resolveTarget(text: string, ctx: NlpContext): Reminder | null {
  if (ctx.active) return ctx.active
  const open = (ctx.reminders ?? []).filter((r) => r.status === 'scheduled' || r.status === 'snoozed' || r.status === 'ringing' || r.status === 'declined' || r.status === 'missed')
  const t = normalize(text)
  const hit = open.filter((r) => r.title.toLowerCase().split(/\s+/).some((w) => w.length > 3 && t.includes(w)))
  return hit.length === 1 ? hit[0] : null
}

export function parseCommand(raw: string, ctx: NlpContext): Intent {
  const t = normalize(raw)
  if (!t) return { type: 'unknown' }

  // Follow-up to a clarification question.
  if (ctx.pending) {
    const seed = ctx.pending
    if (/\b(nahi|nahin|no|cancel|rehne do|chhodo)\b/.test(t)) return { type: 'unknown' }
    const w = parseWhen(t, ctx, seed)
    if (w.kind === 'ok') {
      if (seed.intent === 'reschedule') return { type: 'reschedule', when: w.when, target: seed.targetId }
      return { type: 'create', title: seed.title || 'Reminder', when: w.when }
    }
    if (w.kind === 'clarify') return { type: 'clarify', question: w.question, pending: { ...seed, ...w.pending, intent: seed.intent } }
    if (/\b(haan|yes|ha|han|kal|tomorrow)\b/.test(t) && seed.dayOffset === 1 && seed.hour != null) {
      const w2 = parseWhen(`kal ${seed.hour} ${seed.ampm ?? ''}`.trim(), ctx, { ...seed })
      if (w2.kind === 'ok') return seed.intent === 'reschedule' ? { type: 'reschedule', when: w2.when, target: seed.targetId } : { type: 'create', title: seed.title || 'Reminder', when: w2.when }
    }
    return { type: 'clarify', question: 'Samajh nahi aaya. Kripya samay batayein, jaise "kal subah 9 baje". / Please tell me the time.', pending: seed }
  }

  const reading = /\b(sugar|glucose|bp|blood pressure|pressure|mmhg|mg\/?dl)\b/.test(t) ? parseReadingText(raw) : null
  if (reading) return { type: 'health', reading }

  const rel = findRelative(t)
  const hasTimeWords = !!(rel || findClock(t) || dayWord(t).text || periodOf(t).p)

  // list
  if (RE.reminderWord.test(t) && RE.list.test(t) && !hasTimeWords) {
    return { type: 'list', scope: /\b(aaj|today)\b/.test(t) ? 'today' : /\b(complete|completed|history|purane|old)\b/.test(t) ? 'all' : 'upcoming' }
  }
  if (RE.reminderWord.test(t) && RE.all.test(t) && RE.list.test(t)) return { type: 'list', scope: 'upcoming' }

  // complete ("ho gaya") – only when it is not a request to set something new
  if (RE.complete.test(t) && !/(yaad dil|remind me|set (a )?reminder|alarm)/.test(t) && !hasTimeWords) return { type: 'complete', target: undefined }

  if (RE.cancel.test(t) && (RE.reminderWord.test(t) || ctx.active)) return { type: 'cancel', target: undefined }

  // reschedule
  if (RE.reschedule.test(t) || (/\bis reminder\b/.test(t) && hasTimeWords) || /\b(this reminder)\b/.test(t)) {
    const target = resolveTarget(raw, ctx)
    const w = parseWhen(t, ctx)
    if (w.kind === 'ok') return { type: 'reschedule', when: w.when, target: target?.id, relativeMinutes: w.relativeMinutes }
    if (w.kind === 'clarify') return { type: 'clarify', question: w.question, pending: { intent: 'reschedule', targetId: target?.id, ...w.pending } }
    return { type: 'clarify', question: 'Kab ke liye reschedule karun? / When should I move it to?', pending: { intent: 'reschedule', targetId: target?.id } }
  }

  // time-only phrase while a reminder is ringing (or explicit "snooze"): "10 minute baad"
  const w = hasTimeWords ? parseWhen(t, ctx) : ({ kind: 'none', used: [] } as When)
  const used = w.used
  const title = cleanTitle(t, used)

  if (rel && (RE.snooze.test(t) || title === '') && w.kind === 'ok') {
    if (ctx.active) {
      const m = w.relativeMinutes!
      if ((SNOOZE_OPTIONS as readonly number[]).includes(m)) return { type: 'snooze', minutes: m as 5 | 10 | 15 }
      return { type: 'reschedule', when: w.when, target: ctx.active.id, relativeMinutes: m }
    }
    return { type: 'clarify', question: 'Kis cheez ke liye yaad dilau? / What should I remind you about?', pending: { intent: 'create', title: '', dayOffset: 0 } }
  }
  if (rel && RE.snooze.test(t) && !ctx.active) {
    return { type: 'clarify', question: 'Abhi koi reminder baj nahi raha. Kis cheez ke liye yaad dilau?', pending: { intent: 'create', title: '' } }
  }

  if (RE.create.test(t) || (hasTimeWords && title !== '')) {
    if (w.kind === 'ok') {
      if (!title) return { type: 'clarify', question: 'Kis cheez ke liye yaad dilau? / What should I remind you about?', pending: { intent: 'create', title: '', dayOffset: 0 } }
      return { type: 'create', title, when: w.when }
    }
    if (w.kind === 'clarify') return { type: 'clarify', question: w.question, pending: { intent: 'create', title: title || 'Reminder', ...w.pending } }
    return { type: 'clarify', question: 'Kab yaad dilau? Jaise "kal subah 9 baje" / When should I remind you?', pending: { intent: 'create', title: title || 'Reminder' } }
  }
  return { type: 'unknown' }
}

export function describeWhen(d: Date, now: Date, tz: string): string {
  const p = tzParts(d, tz)
  return `${fmtDayRel(d, now, tz)} ${fmtHM(`${pad(p.h)}:${pad(p.min)}`)}`
}
export { addLocalDays, localDateKey }
