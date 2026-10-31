// Maps Sarvam Extract JSON (schema-shaped result + annotations) into Smaran drafts.
// Missing values stay empty and are flagged. Nothing is invented.
import type { ExtractedMedicine, ExtractionOutput } from './extraction-types.ts'
import { parseMedicineLine } from './prescription-parser.ts'
import type { ParseResult } from './prescription-parser.ts'

const BLANK = /^(?:[-–—]|n\/?a|null|none|unknown|not (?:found|written|specified)|illegible)?$/i
export const LOW_CONFIDENCE = 0.7

export const str = (v: unknown): string => {
  if (v == null) return ''
  const s = String(v).replace(/\s+/g, ' ').trim()
  return BLANK.test(s) ? '' : s
}

const confOf = (node: unknown): number | undefined => {
  if (!node || typeof node !== 'object') return undefined
  const c = (node as { confidence?: unknown }).confidence
  return typeof c === 'number' && Number.isFinite(c) ? c : undefined
}

function minConf(ann: unknown, keys: string[]): number | undefined {
  if (!ann || typeof ann !== 'object') return undefined
  let min: number | undefined
  for (const k of keys) {
    const c = confOf((ann as Record<string, unknown>)[k])
    if (c == null) continue
    min = min == null ? c : Math.min(min, c)
  }
  return min
}

function lineFromFields(m: Record<string, unknown>): string {
  return ['name', 'strength', 'dosage', 'frequency', 'intake_timing', 'food_instructions', 'duration', 'additional_instructions']
    .map((k) => str(m[k])).filter(Boolean).join(' ')
}

function fromRow(m: Record<string, unknown>, ann: unknown, sourceText: string): ExtractedMedicine | null {
  const name = str(m.name)
  if (!name) return null
  const parsed = parseMedicineLine(lineFromFields(m))
  const unclear = str(m.unclear_or_missing)
  const extraNotes = [str(m.additional_instructions), unclear].filter(Boolean).join(' ')
  const c = minConf(ann, ['name', 'strength', 'dosage', 'frequency', 'intake_timing', 'food_instructions', 'duration'])
  const noisy = (c != null && c < LOW_CONFIDENCE) || !!unclear || /[�?]|\[?(?:illegible|unclear)\]?/i.test(sourceText)

  if (parsed && parsed.name) {
    const flags = new Set(toFlags(parsed, noisy))
    if (noisy) flags.add('low_confidence')
    if (unclear && !flags.has('low_confidence')) flags.add('low_confidence')
    return {
      name: parsed.name || name,
      strength: parsed.strength,
      dose: parsed.dose,
      frequency: parsed.frequency ?? (parsed.prn ? 'custom' : null),
      times: parsed.times,
      timeOfDay: parsed.timeOfDay,
      food: parsed.food,
      duration: parsed.duration,
      courseDays: parsed.durationUnclear ? undefined : parsed.courseDays,
      notes: [parsed.prn ? 'Written as needed (SOS/PRN): no fixed schedule.' : '', parsed.doseConflict ? 'Different amounts at different times; check the dose.' : '', extraNotes].filter(Boolean).join(' '),
      sourceText,
      flags: [...flags],
      lowConfidence: noisy,
      evidence: parsed.evidence,
    }
  }

  return {
    name, strength: str(m.strength), dose: str(m.dosage), frequency: null, times: [], timeOfDay: [],
    food: null, duration: null, notes: extraNotes, sourceText,
    flags: ['strength_missing', 'dose_missing', 'frequency_unclear', 'timing_unclear', 'food_missing', 'duration_unclear', ...(noisy ? ['low_confidence' as const] : [])],
    lowConfidence: noisy, evidence: {},
  }
}

function toFlags(f: NonNullable<ReturnType<typeof parseMedicineLine>>, noisy: boolean): ExtractedMedicine['flags'] {
  const flags: ExtractedMedicine['flags'] = []
  if (!f.strength) flags.push('strength_missing')
  if (!f.dose) flags.push('dose_missing')
  if (f.prn) flags.push('as_needed')
  if (!f.frequency && !f.prn) flags.push('frequency_unclear')
  if (f.times.length === 0) flags.push(f.timeOfDay.length ? 'exact_time_needed' : 'timing_unclear')
  if (!f.food) flags.push('food_missing')
  if (!f.duration || f.durationUnclear) flags.push('duration_unclear')
  if (noisy) flags.push('low_confidence')
  return flags
}

export interface ExtractPayload {
  result?: unknown
  annotations?: unknown
  pages?: { total: number; succeeded: number; failed: number }
  partial?: boolean
}

export function mapExtractResult(p: ExtractPayload): ParseResult & { document: { patientName: string; doctorName: string; prescriptionDate: string }; rawText: string } {
  const result = (p.result && typeof p.result === 'object' ? p.result : {}) as Record<string, unknown>
  const annotations = (p.annotations && typeof p.annotations === 'object' ? p.annotations : {}) as Record<string, unknown>
  const rows = Array.isArray(result.medicines) ? result.medicines : []
  const annRows = Array.isArray(annotations.medicines) ? annotations.medicines : []
  const medicines: ExtractedMedicine[] = []
  const warnings: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const src = lineFromFields(rec) || str(rec.name)
    const med = fromRow(rec, annRows[i], src)
    if (!med) continue
    const k = `${med.name.toLowerCase()}|${med.strength.toLowerCase()}`
    if (seen.has(k)) { warnings.push(`"${med.name}" appears more than once; the duplicate was dropped.`); continue }
    seen.add(k)
    medicines.push(med)
  }
  const other = [str(result.additional_instructions), str(result.unclear_or_missing)].filter(Boolean)
  if (str(result.unclear_or_missing)) warnings.push('The reader marked some information as unclear or missing. Please check the review screen.')
  if (!medicines.length) warnings.push('No medicines could be identified in the document.')
  const document = {
    patientName: str(result.patient_name),
    doctorName: str(result.doctor_name),
    prescriptionDate: str(result.prescription_date),
  }
  const header = [
    document.patientName && `Patient: ${document.patientName}`,
    document.doctorName && `Doctor: ${document.doctorName}`,
    document.prescriptionDate && `Date: ${document.prescriptionDate}`,
  ].filter(Boolean)
  const rawText = [...header, ...medicines.map((m) => m.sourceText), ...other].join('\n')
  return { medicines, otherInstructions: other, warnings, document, rawText }
}

export function toExtractionOutput(mapped: ReturnType<typeof mapExtractResult>, extra: { partial: boolean; pages?: ExtractionOutput['pages'] }): ExtractionOutput {
  const warnings = [...mapped.warnings]
  if (extra.partial) warnings.push(`${extra.pages?.failed || 'Some'} page${extra.pages?.failed === 1 ? '' : 's'} could not be read, so some medicines may be missing.`)
  const partial = extra.partial || mapped.medicines.some((m) => m.lowConfidence)
  return {
    provider: 'sarvam', isMock: false, outcome: partial ? 'partial' : 'success',
    rawText: mapped.rawText, rawFormat: 'json', medicines: mapped.medicines,
    otherInstructions: mapped.otherInstructions, warnings, pages: extra.pages,
    document: mapped.document,
  }
}
