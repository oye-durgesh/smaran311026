import { describe, expect, it } from 'vitest'
import { healthCard, trendOf, trendText } from '../healthcard'
import type { Appointment, Medicine, Reading } from '../types'

const NOW = new Date('2026-10-29T05:00:00Z')
const day = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString()
const sugar = (i: number, at: string, value: number, extra: Partial<Reading> = {}): Reading => ({ id: 's' + i, type: 'sugar', at, value, unit: 'mg/dL', context: 'fasting', source: 'manual', createdAt: at, updatedAt: at, ...extra })
const bp = (i: number, at: string, systolic: number, diastolic: number): Reading => ({ id: 'b' + i, type: 'bp', at, systolic, diastolic, source: 'manual', createdAt: at, updatedAt: at })

describe('health card', () => {
  it('no readings → nothing is shown or invented', () => {
    const c = healthCard([], [], [], NOW)
    expect(c).toMatchObject({ sugar: null, bp: null, followUp: null, sugarTrend: { kind: 'not_enough_data', points: 0 } })
  })
  it('latest reading keeps its value, unit, time, context and source', () => {
    const c = healthCard([sugar(1, day(3), 130), sugar(2, day(1), 112, { context: 'after_meal', source: 'voice' })], [], [], NOW)
    expect(c.sugar!.reading).toMatchObject({ value: 112, unit: 'mg/dL', context: 'after_meal', source: 'voice' }); expect(c.sugar!.ageDays).toBe(1); expect(c.sugar!.stale).toBe(false)
  })
  it('an old reading is marked stale, not "current"', () => {
    const c = healthCard([sugar(1, day(12), 120)], [], [], NOW)
    expect(c.sugar).toMatchObject({ ageDays: 12, stale: true })
  })
  it('a reading dated in the future is ignored', () => {
    const future = new Date(NOW.getTime() + 3 * 86400000).toISOString()
    expect(healthCard([sugar(1, future, 99)], [], [], NOW).sugar).toBeNull()
  })
  it('a trend needs at least 4 valid readings in 30 days', () => {
    expect(trendOf([sugar(1, day(1), 100), sugar(2, day(2), 110), sugar(3, day(3), 120)], (r) => r.value, NOW)).toEqual({ kind: 'not_enough_data', points: 3 })
    const old = [1, 2, 3, 4].map((i) => sugar(i, day(40 + i), 100 + i))
    expect(trendOf(old, (r) => r.value, NOW).kind).toBe('not_enough_data')
  })
  it('rising / falling / steady with a 7% tolerance; invalid values are skipped', () => {
    const mk = (vals: number[]) => vals.map((v, i) => sugar(i, day(vals.length - i), v))
    expect(trendOf(mk([100, 102, 130, 135]), (r) => r.value, NOW).kind).toBe('rising')
    expect(trendOf(mk([140, 135, 110, 105]), (r) => r.value, NOW).kind).toBe('falling')
    expect(trendOf(mk([110, 112, 111, 113]), (r) => r.value, NOW).kind).toBe('steady')
    expect(trendOf([...mk([100, 101, 102]), sugar(9, day(0.5), NaN as number)], (r) => r.value, NOW)).toEqual({ kind: 'not_enough_data', points: 3 })
  })
  it('trend wording does not diagnose', () => {
    expect(trendText({ kind: 'rising', points: 5 }, 'Blood sugar')).toMatch(/talk to the doctor/)
    expect(trendText({ kind: 'rising', points: 5 }, 'Blood sugar')).not.toMatch(/diabet|hypertens|disease/i)
    expect(trendText({ kind: 'not_enough_data', points: 1 }, 'blood pressure')).toMatch(/Not enough readings/)
  })
  it('follow-up: the next upcoming appointment wins over a prescription follow-up date; cancelled/past ones are ignored', () => {
    const appt = (id: string, at: string, status: Appointment['status'] = 'upcoming'): Appointment => ({ id, title: 'Dr. Mehta', at, timeZone: 'Asia/Kolkata', reminder: 'none', status, createdAt: day(5), updatedAt: day(5) })
    const med = { id: 'm', name: 'Metformin', followUpDate: '2026-11-20', status: 'active' } as Medicine
    const next = new Date(NOW.getTime() + 3 * 86400000).toISOString()
    expect(healthCard([], [appt('a', next)], [med], NOW).followUp).toMatchObject({ source: 'appointment', at: next })
    expect(healthCard([], [appt('a', next, 'cancelled'), appt('b', day(2))], [med], NOW).followUp).toMatchObject({ source: 'prescription', at: '2026-11-20' })
    expect(healthCard([], [], [{ ...med, followUpDate: '2026-10-01' }], NOW).followUp).toBeNull()
  })
  it('blood pressure card uses systolic for its trend', () => {
    const rs = [150, 148, 130, 128].map((s, i) => bp(i, day(4 - i), s, 85))
    expect(healthCard(rs, [], [], NOW).bpTrend.kind).toBe('falling')
  })
})
