import type { Frequency, Medicine, MedFlag, Reminder, ReminderSeries, TimeOfDay } from './types'
import { newId } from './ids'
import { fmtHM, fmtHMShort, localDateKey, addLocalDays, tzParts, pad } from './time'
import { cancel, isActive } from './reminders'

export const FREQ_COUNT: Record<Frequency, number> = { once: 1, twice: 2, thrice: 3, custom: 0 }
export const TIME_OF_DAY_HM: Record<TimeOfDay, string> = { morning: '08:00', afternoon: '14:00', evening: '18:00', night: '22:00' }

export const displayName = (m: Pick<Medicine, 'name' | 'strength'>) => [m.name, m.strength].filter(Boolean).join(' ')
export const freqLabel = (f: Frequency) => ({ once: 'Once daily', twice: 'Twice daily', thrice: 'Thrice daily', custom: 'Custom' }[f])
export const foodLabel = (f: Medicine['food']) =>
  f === 'before' ? 'Before food' : f === 'with' ? 'With food' : f === 'after' ? 'After food' : f === 'none' ? 'No instruction' : 'Not specified'
export const timesLabel = (m: Pick<Medicine, 'times'>) => m.times.map(fmtHM).join(', ')
export const timesShort = (m: Pick<Medicine, 'times'>) => m.times.map(fmtHMShort).join(', ')
export const periodOf = (hm: string): 'Morning' | 'Afternoon' | 'Evening' | 'Night' => {
  const h = +hm.split(':')[0]
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 19 ? 'Evening' : 'Night'
}
export const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export interface MedValidation { errors: Partial<Record<'name' | 'strength' | 'dose' | 'times' | 'food' | 'courseDays' | 'frequency', string>>; ok: boolean }

/** Validation used before a medicine can be marked confirmed. Never invents missing instructions. */
export function validateMedicine(m: Pick<Medicine, 'name' | 'strength' | 'dose' | 'frequency' | 'times' | 'food' | 'duration' | 'courseDays'>): MedValidation {
  const errors: MedValidation['errors'] = {}
  if (!m.name.trim()) errors.name = 'Enter the medicine name.'
  if (!m.strength.trim()) errors.strength = 'Enter the strength, for example 500mg.'
  if (!m.dose.trim()) errors.dose = 'Enter the dose, for example 1 tablet.'
  const need = FREQ_COUNT[m.frequency]
  if (m.times.length === 0) errors.times = 'Choose a reminder time.'
  else if (m.times.some((t) => !HM_RE.test(t))) errors.times = 'Enter a valid time.'
  else if (new Set(m.times).size !== m.times.length) errors.times = 'Each reminder time must be different.'
  else if (need && m.times.length !== need) errors.times = `${freqLabel(m.frequency)} needs ${need} reminder time${need > 1 ? 's' : ''}.`
  if (m.food === null) errors.food = 'Choose a food instruction, or "No instruction".'
  if (m.duration === 'course' && !(m.courseDays && m.courseDays > 0 && m.courseDays <= 365)) errors.courseDays = 'Enter the course length in days (1–365).'
  return { errors, ok: Object.keys(errors).length === 0 }
}

export function computeFlags(m: Pick<Medicine, 'strength' | 'dose' | 'times' | 'food'>, lowConfidence: boolean): MedFlag[] {
  const f: MedFlag[] = []
  if (!m.strength.trim()) f.push('strength_missing')
  if (!m.dose.trim()) f.push('dose_missing')
  if (m.times.length === 0) f.push('timing_unclear')
  if (m.food === null) f.push('food_missing')
  if (lowConfidence) f.push('low_confidence')
  return f
}

export function blankMedicine(tz: string, now: Date, source: Medicine['source'] = 'manual'): Medicine {
  return {
    id: newId('med'), name: '', strength: '', dose: '', frequency: 'once', timeOfDay: [], times: [], food: null,
    duration: 'ongoing', notes: '', status: 'draft', source, flags: [], timeZone: tz, createdAt: now.toISOString(),
  }
}

/** The review line shown on medicine cards. */
export function summaryLine(m: Medicine): string {
  const parts = [m.dose, freqLabel(m.frequency).replace(' daily', ' daily')]
  if (m.times.length === 0) parts.push('Timing unclear')
  else if (m.food) parts.push(m.food === 'none' ? periodOf(m.times[0]) : foodLabel(m.food))
  else parts.push(periodOf(m.times[0]))
  return parts.filter(Boolean).join(' · ')
}

export function courseEnd(m: Medicine, tz: string): string | undefined {
  if (m.duration !== 'course' || !m.courseDays || !m.activatedAt) return undefined
  const p = tzParts(new Date(m.activatedAt), tz)
  const e = addLocalDays(p.y, p.m, p.d, m.courseDays - 1)
  return `${e.y}-${pad(e.m)}-${pad(e.d)}`
}

/**
 * Bring a medicine's recurring series and future reminders in line with its current times/status.
 * Series for removed times are deactivated and their not-yet-rung reminders cancelled.
 */
export function syncMedicineSeries(
  med: Medicine, series: ReminderSeries[], reminders: Reminder[], ownerId: string, now: Date,
): { series: ReminderSeries[]; reminders: Reminder[] } {
  const live = med.status === 'active'
  const wanted = new Set(live ? med.times : [])
  const endsOn = courseEnd(med, med.timeZone)
  const nextSeries: ReminderSeries[] = series.map((s) => {
    if (s.medicineId !== med.id) return s
    return { ...s, active: wanted.has(s.localTime), title: displayName(med), endsOn, notes: med.notes || undefined }
  })
  const have = new Set(nextSeries.filter((s) => s.medicineId === med.id).map((s) => s.localTime))
  for (const t of wanted) {
    if (have.has(t)) continue
    nextSeries.push({
      id: `ser_${med.id}_${t.replace(':', '')}`, ownerId, kind: 'medicine', title: displayName(med), medicineId: med.id,
      localTime: t, timeZone: med.timeZone, active: true, startAt: now.toISOString(), endsOn,
    })
  }
  const activeIds = new Set(nextSeries.filter((s) => s.active).map((s) => s.id))
  const nextReminders = reminders.map((r) => {
    if (r.medicineId !== med.id) return r
    const fresh = isActive(r) && r.status !== 'ringing'
    // System cancellations free the idempotency key so resuming/re-adding the time can recreate the occurrence;
    // a cancellation made by the user keeps its key and is never regenerated.
    if (fresh && (!r.seriesId || !activeIds.has(r.seriesId))) return { ...cancel(r, now), idempotencyKey: `${r.idempotencyKey}:superseded:${now.getTime()}` }
    if (fresh && r.title !== displayName(med)) return { ...r, title: displayName(med), updatedAt: now.toISOString() }
    return r
  })
  return { series: nextSeries, reminders: nextReminders }
}

export function nextDoseFor(medId: string, reminders: Reminder[]): Reminder | undefined {
  return reminders.filter((r) => r.medicineId === medId && isActive(r)).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0]
}
export { localDateKey }
