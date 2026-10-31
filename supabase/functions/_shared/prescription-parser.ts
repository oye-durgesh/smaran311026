// Conservative prescription-text → medicine-draft parser.
// RULES: only information WRITTEN in the document is extracted. A missing or ambiguous field stays empty and is flagged for
// the user to review. We never guess doses, frequencies, clock times, food instructions or durations.
import type { ExtractedMedicine, FrequencyName, MedFlagName, TimeOfDayName } from './extraction-types.ts'

export interface ParseResult { medicines: ExtractedMedicine[]; otherInstructions: string[]; warnings: string[] }

const FORM = '(?:tab(?:let)?s?|cap(?:sule)?s?|syp|syrup|susp(?:ension)?|inj(?:ection)?|drops?|oint(?:ment)?|cream|gel|lotion|sachet|powder|inhaler|respules?|nebul\\w*|spray|patch|supp(?:ository)?|tab\\.|cap\\.)'
const FORM_PREFIX = new RegExp(`^(?:rx\\s*[:.]?\\s*)?(?:\\d{1,2}\\s*[.)\\-:]\\s*)?(${FORM})\\b\\.?\\s*`, 'i')
const INDEX_PREFIX = /^\s*(?:[-*•▪●]|\d{1,2}\s*[.)])\s*/
const STRENGTH = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|μg|g|iu|%|mg\/ml|mcg\/ml)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:ml|g))?/i
const DOSE = /(\d+(?:\.\d+)?|½|¼|¾|1\/2|1\/4|one|two|three)\s*(tab(?:let)?s?|cap(?:sule)?s?|ml|puffs?|drops?|tsp|teaspoons?|sachets?|units?)\b/i
const NOTATION = /(?:^|[\s(])(½|\d+(?:\/\d+)?)\s*-\s*(½|\d+(?:\/\d+)?)\s*-\s*(½|\d+(?:\/\d+)?)(?:\s*-\s*(½|\d+(?:\/\d+)?))?(?=$|[\s,;).])/
const DURATION = /(?:\b(?:x|for|×|upto|up to|till|since)\s*)?(\d+)\s*(days?|d|weeks?|wks?|w|months?|mos?)\b/i
const CLOCK = /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i

const SKIP_LINE = /^(?:dr\.?|doctor|reg(?:istration)?\.?\s*no|patient|name|age|sex|gender|date|address|phone|mobile|contact|weight|height|bp|pulse|temp|diagnosis|dx|c\/o|complaints?|h\/o|clinic|hospital|signature|sign|license|mci|nmc|page|www\.|email|e-mail|follow[- ]?up|next visit|rx\s*$)\b/i
const HEADING_ADVICE = /^(?:#+\s*)?(advice|instructions?|note|notes|remarks|precautions?|diet|salah|सलाह|निर्देश)\s*[:\-]?\s*(.*)$/i

const HINDI: Array<[RegExp, string]> = [
  [/दिन में एक बार|रोज़? एक बार|एक बार/g, ' once daily '], [/दिन में दो बार|सुबह[- ]शाम|दो बार/g, ' twice daily '], [/दिन में तीन बार|तीन बार/g, ' thrice daily '],
  [/खाने के बाद|भोजन के बाद/g, ' after food '], [/खाने से पहले|भोजन से पहले|खाली पेट/g, ' before food '], [/खाने के साथ/g, ' with food '],
  [/सुबह/g, ' morning '], [/दोपहर/g, ' afternoon '], [/शाम/g, ' evening '], [/रात को|रात में|रात/g, ' night '],
  [/(\d+)\s*दिन/g, ' $1 days '], [/(\d+)\s*हफ्ते|(\d+)\s*सप्ताह/g, ' $1 weeks '], [/गोली/g, ' tablet '], [/चम्मच/g, ' tsp '],
]

const FREQ_WORDS: Array<[RegExp, FrequencyName | 'prn', string]> = [
  [/\b(?:od|o\.d\.?|qd|q\.d\.?|once\s+(?:a\s+|per\s+)?(?:day|daily)|daily\s+once|1\s*x\s*\/?\s*(?:day|d)|ek\s+baar)\b/i, 'once', 'once daily'],
  [/\b(?:bd|b\.d\.?|bid|b\.i\.d\.?|bds|twice\s+(?:a\s+|per\s+)?(?:day|daily)|2\s*x\s*\/?\s*(?:day|d)|two\s+times)\b/i, 'twice', 'twice daily'],
  [/\b(?:tds|t\.d\.s\.?|tid|t\.i\.d\.?|thrice\s*(?:a\s+)?(?:day|daily)?|three\s+times|3\s*x\s*\/?\s*(?:day|d))\b/i, 'thrice', 'thrice daily'],
  [/\b(?:qid|q\.i\.d\.?|four\s+times|4\s*x\s*\/?\s*(?:day|d))\b/i, 'custom', 'four times daily'],
  [/\b(?:sos|s\.o\.s\.?|prn|as\s+(?:needed|required)|if\s+(?:needed|required|pain|fever)|when\s+(?:needed|required)|stat)\b/i, 'prn', 'as needed'],
  [/\b(?:weekly|once\s+a\s+week|alternate\s+days?|every\s+other\s+day|every\s+\d+\s+(?:days?|hours?|hrs?))\b/i, 'custom', 'non-daily schedule'],
]
const PERIODS: Array<[RegExp, TimeOfDayName]> = [
  [/\b(?:morning|am\b|breakfast|subah|सुबह)/i, 'morning'], [/\b(?:afternoon|noon|lunch|dopahar)/i, 'afternoon'],
  [/\b(?:evening|shaam|tea\s*time)/i, 'evening'], [/\b(?:night|bed\s*time|bedtime|hs\b|h\.s\.?|at\s+night|raat|dinner)/i, 'night'],
]
const FOOD: Array<[RegExp, 'before' | 'with' | 'after']> = [
  [/\b(?:after\s+(?:food|meals?|eating|breakfast|lunch|dinner)|post\s*prandial|p\.?c\.?)(?=$|[\s,;.)])/i, 'after'],
  [/\b(?:before\s+(?:food|meals?|eating|breakfast|lunch|dinner)|empty\s+stomach|pre\s*prandial|a\.?c\.?)(?=$|[\s,;.)])/i, 'before'],
  [/\b(?:with\s+(?:food|meals?|milk)|along\s+with\s+food)/i, 'with'],
]

const frac = (s: string) => ({ '½': 0.5, '¼': 0.25, '¾': 0.75, '1/2': 0.5, '1/4': 0.25 } as Record<string, number>)[s] ?? Number(s)
const word = (s: string) => ({ one: 1, two: 2, three: 3 } as Record<string, number>)[s.toLowerCase()] ?? frac(s)

function unitFor(form: string | null): string {
  const f = (form ?? '').toLowerCase()
  if (/^tab/.test(f)) return 'tablet'
  if (/^cap/.test(f)) return 'capsule'
  if (/^(syp|syrup|susp)/.test(f)) return 'ml'
  return ''
}
const plural = (n: number, unit: string) => (unit === 'ml' || n === 1 || unit === '' ? unit : `${unit}s`)
const fmtQty = (n: number) => (n === 0.5 ? '½' : n === 0.25 ? '¼' : n === 0.75 ? '¾' : String(n))

function normalise(line: string): string {
  let s = line
  for (const [re, to] of HINDI) s = s.replace(re, to)
  return s.replace(/[ \t]+/g, ' ').trim()
}

interface Fields {
  name: string; strength: string; dose: string; frequency: FrequencyName | null; prn: boolean; times: string[]; timeOfDay: TimeOfDayName[]
  food: 'before' | 'with' | 'after' | null; duration: 'ongoing' | 'course' | null; courseDays?: number; durationUnclear?: boolean
  rest: string; evidence: ExtractedMedicine['evidence']; doseConflict?: boolean; form: string | null
}

/** Parse one logical medicine line / table row. */
export function parseMedicineLine(raw: string): Fields | null {
  let line = normalise(raw).replace(INDEX_PREFIX, '').trim()
  if (!line || SKIP_LINE.test(line)) return null
  const fp = FORM_PREFIX.exec(line)
  const form = fp ? fp[1] : null
  const body = fp ? line.slice(fp[0].length) : line
  const strengthM = STRENGTH.exec(body)
  const notation = NOTATION.exec(body)
  const f: Fields = { name: '', strength: '', dose: '', frequency: null, prn: false, times: [], timeOfDay: [], food: null, duration: null, rest: '', evidence: {}, form }

  // strength
  if (strengthM) f.strength = strengthM[0].replace(/\s+/g, '').replace(',', '.').replace(/(\d)(iu)/i, '$1 IU')

  // frequency
  const ev = f.evidence
  if (notation) {
    const slots = [notation[1], notation[2], notation[3], notation[4]].filter((x) => x !== undefined) as string[]
    const nums = slots.map((x) => word(x))
    const on = nums.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0)
    ev.frequency = notation[0].trim()
    f.frequency = on.length === 1 ? 'once' : on.length === 2 ? 'twice' : on.length === 3 ? 'thrice' : on.length >= 4 ? 'custom' : null
    const names: TimeOfDayName[] = slots.length === 3 ? ['morning', 'afternoon', 'night'] : ['morning', 'afternoon', 'evening', 'night']
    f.timeOfDay = on.map((i) => names[i]).filter(Boolean)
    ev.timing = `${notation[0].trim()} → ${f.timeOfDay.join(', ')}`
    const amounts = new Set(on.map((i) => nums[i]))
    if (amounts.size === 1) {
      const q = nums[on[0]]
      const u = unitFor(form)
      if (u && q > 0) { f.dose = `${fmtQty(q)} ${plural(q, u)}`; ev.dose = `${notation[0].trim()} (${fmtQty(q)} per dose)` }
    } else if (amounts.size > 1) f.doseConflict = true
  } else {
    for (const [re, fr, label] of FREQ_WORDS) {
      const m = re.exec(body)
      if (m) { ev.frequency = m[0].trim(); if (fr === 'prn') f.prn = true; else f.frequency = fr; void label; break }
    }
  }

  // explicit dose ("1 tab", "5 ml") — not part of a strength like 125mg/5ml
  if (!f.dose) {
    const bodyNoStrength = strengthM ? body.replace(strengthM[0], ' ') : body
    const dm = DOSE.exec(bodyNoStrength)
    if (dm) {
      const q = word(dm[1]); const u = dm[2].toLowerCase().replace(/s$/, '')
      f.dose = `${fmtQty(q)} ${u === 'tab' ? 'tablet' : u === 'cap' ? 'capsule' : u === 'teaspoon' ? 'tsp' : u}${q > 1 && !/ml|tsp/.test(u) ? 's' : ''}`.replace('tabletss', 'tablets')
      ev.dose = dm[0]
    }
  }

  // explicit clock times
  const clockRe = new RegExp(CLOCK.source, 'gi')
  let cm: RegExpExecArray | null
  while ((cm = clockRe.exec(body))) {
    let h = +cm[1]; const mi = cm[2] ? +cm[2] : 0
    if (h < 1 || h > 12 || mi > 59) continue
    if (cm[3].toLowerCase() === 'pm' && h !== 12) h += 12
    if (cm[3].toLowerCase() === 'am' && h === 12) h = 0
    f.times.push(`${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`)
    ev.timing = [ev.timing, cm[0].trim()].filter(Boolean).join('; ')
  }
  // written periods ("morning", "at night", "HS")
  if (!notation) for (const [re, p] of PERIODS) { const m = re.exec(body); if (m && !f.timeOfDay.includes(p) && !/^am$/i.test(m[0].trim())) { f.timeOfDay.push(p); ev.timing = [ev.timing, m[0].trim()].filter(Boolean).join('; ') } }
  if (/\b(?:hs|h\.s\.?|bed\s*time|bedtime)\b/i.test(body) && !f.frequency && !f.prn) { f.frequency = 'once'; ev.frequency = 'HS (bedtime)' }
  // a clearly stated count of periods ("morning and night") implies twice only if the document says it
  if (!f.frequency && !f.prn && f.timeOfDay.length > 1 && /\b(?:and|&|,|-)\b/i.test(body)) { f.frequency = f.timeOfDay.length === 2 ? 'twice' : f.timeOfDay.length === 3 ? 'thrice' : null }

  // food
  for (const [re, v] of FOOD) { const m = re.exec(body); if (m) { f.food = v; ev.food = m[0].trim(); break } }

  // duration
  const dur = DURATION.exec(body.replace(strengthM ? strengthM[0] : '§§', ' '))
  if (dur && !/^(?:g|mg)$/i.test(dur[2])) {
    const n = +dur[1]; const u = dur[2].toLowerCase()
    if (/^d/.test(u)) { f.duration = 'course'; f.courseDays = n; ev.duration = dur[0].trim() }
    else if (/^w/.test(u)) { f.duration = 'course'; f.courseDays = n * 7; ev.duration = dur[0].trim() }
    else { f.duration = 'course'; f.durationUnclear = true; ev.duration = dur[0].trim() } // months: not converted, user confirms
  } else if (/\b(?:continue|ongoing|regularly|long\s*term|lifelong|life\s*long)\b/i.test(body)) { f.duration = 'ongoing'; ev.duration = 'continue' }

  // name: from after the form prefix up to the first strength / dose / frequency / food / duration token
  const cut = [strengthM?.index, notation?.index, DOSE.exec(body)?.index, ...FREQ_WORDS.map(([re]) => re.exec(body)?.index), FOOD.map(([re]) => re.exec(body)?.index).find((x) => x !== undefined)]
    .filter((x): x is number => typeof x === 'number' && x > 0)
  const end = cut.length ? Math.min(...cut) : body.length
  f.name = body.slice(0, end).replace(/[|,;:()\[\]]+/g, ' ').replace(/\b(?:rx|tab|cap)\b\.?/gi, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ')
  f.rest = body.slice(end).trim()
  return f
}

const looksLikeMedicine = (f: Fields, hadForm: boolean, raw: string): boolean => {
  if (!f.name || !/^\p{L}/u.test(f.name) || f.name.replace(/[^\p{L}]/gu, '').length < 3) return false
  if (SKIP_LINE.test(f.name)) return false
  if (hadForm) return true
  const signals = [f.strength, f.frequency || f.prn, f.dose, f.food, f.duration].filter(Boolean).length
  return !!f.strength && signals >= 2 || /\|/.test(raw) && signals >= 2
}

function toExtracted(f: Fields, sourceText: string): ExtractedMedicine {
  const flags: MedFlagName[] = []
  if (!f.strength) flags.push('strength_missing')
  if (!f.dose) flags.push('dose_missing')
  if (f.prn) flags.push('as_needed')
  if (!f.frequency && !f.prn) flags.push('frequency_unclear')
  if (f.times.length === 0) flags.push(f.timeOfDay.length ? 'exact_time_needed' : 'timing_unclear')
  if (!f.food) flags.push('food_missing')
  if (!f.duration || f.durationUnclear) flags.push('duration_unclear')
  const noisy = /[�?]|\[?(?:illegible|unclear)\]?/i.test(sourceText) || f.name.length < 3 || (f.name.match(/[^\p{L}\s.\-]/gu)?.length ?? 0) > 1
  if (noisy) flags.push('low_confidence')
  const notes = [f.prn ? 'Written as needed (SOS/PRN): no fixed schedule.' : '', f.doseConflict ? 'Different amounts at different times; check the dose.' : '', f.rest && !f.evidence.frequency ? '' : '']
    .filter(Boolean).join(' ')
  return {
    name: f.name, strength: f.strength, dose: f.dose, frequency: f.frequency ?? (f.prn ? 'custom' : null), times: f.times, timeOfDay: f.timeOfDay,
    food: f.food, duration: f.duration, courseDays: f.durationUnclear ? undefined : f.courseDays, notes, sourceText: sourceText.trim(), flags,
    lowConfidence: noisy, evidence: f.evidence,
  }
}

function mergeMissing(into: Fields, extra: Fields) {
  into.dose ||= extra.dose; into.frequency ??= extra.frequency; into.prn ||= extra.prn
  if (!into.times.length) into.times = extra.times
  for (const p of extra.timeOfDay) if (!into.timeOfDay.includes(p)) into.timeOfDay.push(p)
  into.food ??= extra.food
  if (!into.duration) { into.duration = extra.duration; into.courseDays = extra.courseDays; into.durationUnclear = extra.durationUnclear }
  into.evidence = { ...extra.evidence, ...into.evidence }
}

/** Column roles of a markdown/html table header. */
function headerRoles(cells: string[]): Array<'name' | 'dose' | 'freq' | 'duration' | 'instr' | null> | null {
  const roles = cells.map((c) => {
    const t = c.toLowerCase()
    if (/(medicine|medication|drug|name|tablet|दवा|औषधि)/.test(t)) return 'name' as const
    if (/(dose|dosage|strength|qty|quantity|मात्रा)/.test(t)) return 'dose' as const
    if (/(freq|schedule|timing|times|when|कब)/.test(t)) return 'freq' as const
    if (/(duration|days|period|अवधि)/.test(t)) return 'duration' as const
    if (/(instruction|remark|note|advice|direction|sig)/.test(t)) return 'instr' as const
    return null
  })
  return roles.includes('name') && roles.filter(Boolean).length >= 2 ? roles : null
}

export function parsePrescriptionText(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const meds: Array<{ f: Fields; src: string[] }> = []
  const other: string[] = []
  const warnings: string[] = []
  let roles: ReturnType<typeof headerRoles> = null
  let inAdvice = false

  for (const raw of lines) {
    const hasPipe = raw.includes('|')
    if (hasPipe) {
      const cells = raw.split('|').map((c) => c.trim())
      const hdr = headerRoles(cells)
      if (hdr) { roles = hdr; inAdvice = false; continue }
      if (roles) {
        const pick = (r: string) => cells.filter((_, i) => roles![i] === r).join(' ')
        const pseudo = `${pick('name')} ${pick('dose')} ${pick('freq')} ${pick('instr')} ${pick('duration') ? `for ${pick('duration')}` : ''}`.replace(/\s+/g, ' ').trim()
        const f = parseMedicineLine(pseudo)
        if (f && looksLikeMedicine(f, true, raw)) { meds.push({ f, src: [cells.filter(Boolean).join(' | ')] }); continue }
      }
    } else roles = null

    const adv = HEADING_ADVICE.exec(raw)
    if (adv && !FORM_PREFIX.test(raw)) { inAdvice = true; if (adv[2]) other.push(adv[2].trim()); continue }
    if (inAdvice) {
      const f0 = parseMedicineLine(raw.replace(/\|/g, ' '))
      if (!(f0 && looksLikeMedicine(f0, FORM_PREFIX.test(normalise(raw).replace(INDEX_PREFIX, '')), raw))) { other.push(raw.replace(INDEX_PREFIX, '').trim()); continue }
      inAdvice = false
    }

    const plain = raw.replace(/\|/g, ' ')
    const hadForm = FORM_PREFIX.test(normalise(plain).replace(INDEX_PREFIX, ''))
    const f = parseMedicineLine(plain)
    if (f && looksLikeMedicine(f, hadForm, raw)) { meds.push({ f, src: [raw] }); continue }

    // continuation of the previous medicine ("- after food for 5 days", "Sig: 1 tab twice daily")
    const prev = meds[meds.length - 1]
    if (prev && /^(?:[-*•▪]|sig\b|take\b|apply\b|use\b|\(|after\b|before\b|with\b|for\b|x\s*\d|\d+\s*(?:days?|weeks?))/i.test(raw)) {
      const extra = parseMedicineLine(`X ${plain.replace(INDEX_PREFIX, '')}`)
      if (extra) { mergeMissing(prev.f, extra); prev.src.push(raw); continue }
    }
    if (prev && /\b(?:advice|note|avoid|drink|diet|rest|review|test)\b/i.test(raw)) { other.push(raw); continue }
    if (!SKIP_LINE.test(raw.replace(INDEX_PREFIX, '')) && /\b(?:avoid|drink|diet|rest|exercise|walk|water|salt|sugar|review|test|monitor|check)\b/i.test(raw)) other.push(raw)
  }

  const medicines = meds.map((m) => toExtracted(m.f, m.src.join(' ')))
  // de-duplicate identical OCR repeats (same name + strength)
  const seen = new Set<string>()
  const unique = medicines.filter((m) => { const k = `${m.name.toLowerCase()}|${m.strength.toLowerCase()}`; if (seen.has(k)) { warnings.push(`"${m.name}" appears more than once; the duplicate was dropped.`); return false } seen.add(k); return true })
  if (!unique.length) warnings.push('No medicines could be identified in the document text.')
  return { medicines: unique, otherInstructions: [...new Set(other.filter(Boolean))], warnings }
}
