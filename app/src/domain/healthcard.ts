/**
 * Health card summary for one person. Only what was actually recorded is shown, with its date and source.
 * Old readings are labelled as old, never as "current". A trend appears only with enough valid history, and nothing here diagnoses anything.
 */
import type { Appointment, Medicine, Reading } from './types'

export const STALE_DAYS = 7
export const TREND_MIN_POINTS = 4
export const TREND_WINDOW_DAYS = 30
const DAY = 86400000

export interface LatestReading { reading: Reading; ageDays: number; stale: boolean }
export type Trend = { kind: 'rising' | 'falling' | 'steady'; points: number } | { kind: 'not_enough_data'; points: number }
export interface HealthCard {
  sugar: LatestReading | null
  bp: LatestReading | null
  sugarTrend: Trend
  bpTrend: Trend
  followUp: { label: string; at: string; source: 'appointment' | 'prescription' } | null
}

const newest = (a: Reading, b: Reading) => b.at.localeCompare(a.at)
const age = (iso: string, now: Date) => Math.max(0, (now.getTime() - new Date(iso).getTime()) / DAY)
const latest = (list: Reading[], now: Date): LatestReading | null => {
  const r = [...list].filter((x) => new Date(x.at).getTime() <= now.getTime() + 5 * 60000).sort(newest)[0]
  return r ? { reading: r, ageDays: Math.floor(age(r.at, now)), stale: age(r.at, now) > STALE_DAYS } : null
}

/** Compare the newer half of the recent readings with the older half. Needs >= 4 valid readings in the last 30 days; tolerance 7%. */
export function trendOf(list: Reading[], pick: (r: Reading) => number | undefined, now: Date): Trend {
  const pts = list.filter((r) => age(r.at, now) <= TREND_WINDOW_DAYS).map((r) => ({ at: r.at, v: pick(r) })).filter((p): p is { at: string; v: number } => typeof p.v === 'number' && Number.isFinite(p.v) && p.v > 0).sort((a, b) => a.at.localeCompare(b.at))
  if (pts.length < TREND_MIN_POINTS) return { kind: 'not_enough_data', points: pts.length }
  const half = Math.floor(pts.length / 2)
  const avg = (xs: typeof pts) => xs.reduce((s, p) => s + p.v, 0) / xs.length
  const older = avg(pts.slice(0, half)), newer = avg(pts.slice(pts.length - half))
  const change = (newer - older) / older
  return { kind: change > 0.07 ? 'rising' : change < -0.07 ? 'falling' : 'steady', points: pts.length }
}

export function healthCard(readings: Reading[], appointments: Appointment[], medicines: Medicine[], now: Date): HealthCard {
  const sugar = readings.filter((r) => r.type === 'sugar'), bp = readings.filter((r) => r.type === 'bp')
  const nextAppt = appointments.filter((a) => a.status === 'upcoming' && new Date(a.at).getTime() >= now.getTime()).sort((a, b) => a.at.localeCompare(b.at))[0]
  const rx = medicines.filter((m) => m.followUpDate && m.status !== 'removed' && m.followUpDate >= now.toISOString().slice(0, 10)).sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!))[0]
  const followUp = nextAppt ? { label: nextAppt.title, at: nextAppt.at, source: 'appointment' as const }
    : rx ? { label: `Follow-up from ${rx.name || 'prescription'}`, at: rx.followUpDate!, source: 'prescription' as const } : null
  return {
    sugar: latest(sugar, now), bp: latest(bp, now),
    sugarTrend: trendOf(sugar, (r) => r.value, now), bpTrend: trendOf(bp, (r) => r.systolic, now),
    followUp,
  }
}
export const trendText = (t: Trend, what: string) => t.kind === 'not_enough_data' ? `Not enough readings yet to show a ${what} trend.` : t.kind === 'steady' ? `${what} has been about the same recently.` : `${what} readings have been ${t.kind} recently. Please talk to the doctor about any worry.`
