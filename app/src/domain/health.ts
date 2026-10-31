import type { Reading, SugarContext } from './types'

export const SUGAR_LIMITS = { 'mg/dL': { min: 20, max: 800 }, 'mmol/L': { min: 1.1, max: 44.4 } } as const
export const MG_PER_MMOL = 18.016

export const contextLabel = (c: SugarContext | undefined) =>
  c === 'fasting' ? 'Fasting' : c === 'before_meal' ? 'Before meal' : c === 'after_meal' ? 'After meal' : c === 'random' ? 'Random' : 'Not specified'

export interface SugarInput { value: string; unit: 'mg/dL' | 'mmol/L'; context: SugarContext; at: string; note: string }
export interface BpInput { systolic: string; diastolic: string; pulse: string; at: string; note: string }

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.trim().replace(',', '.')))

export function validateSugar(i: SugarInput, now: Date): { errors: Record<string, string>; ok: boolean } {
  const errors: Record<string, string> = {}
  const v = num(i.value)
  const lim = SUGAR_LIMITS[i.unit]
  if (Number.isNaN(v)) errors.value = 'Enter the reading as a number.'
  else if (v < lim.min || v > lim.max) errors.value = `A ${i.unit} reading is usually between ${lim.min} and ${lim.max}. Please check the number.`
  else if (i.unit === 'mg/dL' && !Number.isInteger(v)) errors.value = 'mg/dL readings are whole numbers.'
  const t = new Date(i.at)
  if (!i.at || Number.isNaN(t.getTime())) errors.at = 'Choose the date and time of the reading.'
  else if (t.getTime() > now.getTime() + 5 * 60000) errors.at = 'The reading time cannot be in the future.'
  return { errors, ok: Object.keys(errors).length === 0 }
}

export function validateBp(i: BpInput, now: Date): { errors: Record<string, string>; ok: boolean } {
  const errors: Record<string, string> = {}
  const s = num(i.systolic), d = num(i.diastolic), p = num(i.pulse)
  if (Number.isNaN(s)) errors.systolic = 'Enter the top number.'
  else if (!Number.isInteger(s) || s < 50 || s > 260) errors.systolic = 'Top number should be a whole number between 50 and 260.'
  if (Number.isNaN(d)) errors.diastolic = 'Enter the bottom number.'
  else if (!Number.isInteger(d) || d < 30 || d > 160) errors.diastolic = 'Bottom number should be a whole number between 30 and 160.'
  if (!errors.systolic && !errors.diastolic && s <= d) errors.diastolic = 'The top number should be higher than the bottom number.'
  if (i.pulse.trim() !== '' && (Number.isNaN(p) || !Number.isInteger(p) || p < 30 || p > 220)) errors.pulse = 'Pulse should be between 30 and 220.'
  const t = new Date(i.at)
  if (!i.at || Number.isNaN(t.getTime())) errors.at = 'Choose the date and time of the reading.'
  else if (t.getTime() > now.getTime() + 5 * 60000) errors.at = 'The reading time cannot be in the future.'
  return { errors, ok: Object.keys(errors).length === 0 }
}

/** Colour class used by the approved design (normal / elevated). General reference ranges, not medical advice. */
export function isElevated(r: Reading): boolean {
  if (r.type === 'sugar' && r.value != null) {
    const mg = r.unit === 'mmol/L' ? r.value * MG_PER_MMOL : r.value
    if (r.context === 'fasting' || r.context === 'before_meal') return mg > 130
    return mg > 180
  }
  if (r.type === 'bp' && r.systolic != null && r.diastolic != null) return r.systolic >= 130 || r.diastolic >= 80
  return false
}

export const fmtSugar = (r: Reading) => `${r.value} ${r.unit ?? 'mg/dL'}`
export const fmtBp = (r: Reading) => `${r.systolic}/${r.diastolic} mmHg`

export interface ParsedReading {
  type: 'sugar' | 'bp'
  value?: number
  unit?: 'mg/dL' | 'mmol/L'
  context?: SugarContext
  systolic?: number
  diastolic?: number
  pulse?: number
}

const DEV: Record<string, string> = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' }
const norm = (t: string) => t.toLowerCase().replace(/[०-९]/g, (c) => DEV[c]).replace(/शुगर/g, 'sugar').replace(/बीपी/g, 'bp').replace(/खाली पेट/g, 'khali pet')

/**
 * Parse a spoken/typed health reading. Returns null when no value can be found – callers must then ask the user.
 * Never infers fasting from the time of day; only explicit words set a context.
 */
export function parseReadingText(raw: string): ParsedReading | null {
  const t = norm(raw)
  const bp = /(\d{2,3})\s*(?:\/|by|upon|over|-|और|aur)\s*(\d{2,3})/.exec(t) ?? (/\b(?:bp|blood pressure|pressure)\b\D{0,12}(\d{2,3})\s+(\d{2,3})/.exec(t))
  if (bp && /(bp|pressure|mmhg|\/)/.test(t)) {
    const pulse = /(?:pulse|heart rate|धड़कन|dhadkan)\D{0,8}(\d{2,3})|(\d{2,3})\s*bpm/.exec(t)
    return { type: 'bp', systolic: +bp[1], diastolic: +bp[2], pulse: pulse ? +(pulse[1] ?? pulse[2]) : undefined }
  }
  if (/(sugar|glucose)/.test(t) || /mg\/?dl|mmol/.test(t)) {
    const m = /(\d+(?:[.,]\d+)?)/.exec(t)
    if (!m) return null
    const unit = /mmol/.test(t) ? 'mmol/L' : 'mg/dL'
    let context: SugarContext = 'unspecified'
    if (/(fasting|khali pet|empty stomach)/.test(t)) context = 'fasting'
    else if (/(before|pehle)\b.{0,12}(meal|breakfast|lunch|dinner|khana|khane|nashta)|(breakfast|lunch|dinner|khana|khane|nashte|nashta|meal)\s+(se\s+)?(pehle|before)/.test(t)) context = 'before_meal'
    else if (/(after|baad)\b.{0,12}(meal|breakfast|lunch|dinner|khana|khane|nashta)|(breakfast|lunch|dinner|khana|khane|nashte|nashta|meal)\s+(ke\s+)?(baad|after)|post.?meal/.test(t)) context = 'after_meal'
    else if (/random/.test(t)) context = 'random'
    return { type: 'sugar', value: +m[1].replace(',', '.'), unit, context }
  }
  return null
}
