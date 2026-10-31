import type { Medicine, MedFlag } from '../domain/types'
import { displayName, periodOf, FREQ_COUNT, freqLabel, foodLabel } from '../domain/medicines'
import { fmtHMShort } from '../domain/time'
import { medGradient, PillIcon } from './kit'

export const flagText: Record<MedFlag, string> = {
  timing_unclear: 'timing unclear', food_missing: 'food instruction missing', strength_missing: 'strength missing',
  dose_missing: 'dose missing', low_confidence: 'low-confidence reading',
  exact_time_needed: 'exact reminder time needed', frequency_unclear: 'frequency unclear', duration_unclear: 'duration unclear', as_needed: 'only when needed — no fixed schedule',
}

/** Round gradient pill avatar from the design. */
export function MedBubble({ med, size, icon }: { med: Pick<Medicine, 'id' | 'color'>; size: number; icon: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: medGradient(med.id, med.color), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <PillIcon size={icon} />
    </div>
  )
}

/** "1 tablet · Twice daily · After food" — what is known, never invented. */
export function reviewLine(m: Medicine): string {
  const parts = [m.dose || null, freqLabel(m.frequency)]
  if (m.times.length === 0) parts.push('Timing unclear')
  else if (m.food && m.food !== 'none') parts.push(foodLabel(m.food))
  else parts.push(periodOf(m.times[0]))
  return parts.filter(Boolean).join(' · ')
}

/** "8 AM, 8 PM · After food" for the routine review. */
export function routineLine(m: Medicine): string {
  const times = m.times.map(fmtHMShort).join(', ')
  const tail = m.food && m.food !== 'none' ? foodLabel(m.food) : m.times[0] ? periodOf(m.times[0]) : ''
  return [times, tail].filter(Boolean).join(' · ')
}

export const listLine = (m: Medicine) =>
  `${freqLabel(m.frequency)}${m.food && m.food !== 'none' ? ` · ${foodLabel(m.food)}` : m.times[0] ? ` · ${periodOf(m.times[0])}` : ''}`

export interface RoutineGroup { time: string; label: string; meds: Medicine[] }
/** Group medicines by reminder time: "Morning 8 AM — Metformin, Amlodipine". */
export function routineGroups(meds: Medicine[]): RoutineGroup[] {
  const map = new Map<string, Medicine[]>()
  for (const m of meds) for (const t of m.times) map.set(t, [...(map.get(t) ?? []), m])
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, ms]) => ({ time: t, label: `${periodOf(t)} ${fmtHMShort(t)}`, meds: ms }))
}
export const reminderCount = (meds: Medicine[]) => meds.reduce((n, m) => n + m.times.length, 0)
export { displayName, FREQ_COUNT }
