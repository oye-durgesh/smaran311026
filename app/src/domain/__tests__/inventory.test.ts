import { describe, expect, it } from 'vitest'
import { estimateStock, txn, validateStockInput } from '../inventory'
import { blankMedicine } from '../medicines'
import type { Medicine, Reminder } from '../types'

const T0 = new Date('2026-10-01T04:00:00Z')
const day = (n: number, h = 0) => new Date(T0.getTime() + n * 86400000 + h * 3600000)
const med = (over: Partial<Medicine['stock']> = {}): Medicine => ({
  ...blankMedicine('Asia/Kolkata', T0), id: 'm1', name: 'Metformin', times: ['08:00', '20:00'], status: 'active',
  stock: { unit: 'tablet', perDose: 1, dosesPerDay: 0, ledger: [txn('opening', 42, 'count', T0)], ...over },
})
const rem = (i: number, status: Reminder['status'], at: Date, user = true): Reminder => ({
  id: `r${i}`, ownerId: 'me', kind: 'medicine', title: 'Metformin', medicineId: 'm1', scheduledFor: at.toISOString(), originalScheduledFor: at.toISOString(), timeZone: 'Asia/Kolkata',
  status, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), snoozeHistory: [], rescheduleHistory: [], deliveryAttempts: [], idempotencyKey: `k${i}`, recurrence: null,
  ...(status === 'completed' ? { completedAt: at.toISOString(), completion: { via: 'tap' as const, basis: user ? ('user-reported' as const) : ('other' as never) } } : {}),
} as Reminder)
// 14 days x 2 confirmed doses
const taken = (days: number) => Array.from({ length: days * 2 }, (_, i) => rem(i, 'completed', day(Math.floor(i / 2), i % 2 ? 12 : 4)))

describe('stock estimate – the worked example', () => {
  it('42 tablets, 1 tablet twice daily → daily use 2, 21 days of supply', () => {
    const e = estimateStock(med(), [], T0)
    expect(e).toMatchObject({ tracked: true, onHand: 42, dailyUse: 2, daysLeft: 21, level: 'ok', uncertain: false, pctLeft: 100 })
  })
  it('after 14 days of CONFIRMED doses: 14 tablets left, 7 days, and a 25% threshold fires', () => {
    const e = estimateStock(med({ lowDays: 3, lowPct: 25 }), taken(14), day(14, 1))
    expect(e).toMatchObject({ onHand: 14, daysLeft: 7, pctLeft: 33 })
    const e2 = estimateStock(med({ lowDays: 3, lowPct: 40 }), taken(14), day(14, 1))
    expect(e2.level).toBe('low')                                    // 33% ≤ 40%
    expect(estimateStock(med({ lowDays: 3, lowPct: 25 }), taken(14), day(14, 1)).level).toBe('ok') // 33% is above 25% and 7 days is above the 3-day line
    expect(estimateStock(med(), taken(14), day(14, 1)).level).toBe('low')                          // default: warn at 7 days
    expect(estimateStock(med(), taken(14), day(14, 1)).message).toMatch(/About 7 days of supply remain/)
  })
  it('thresholds are the user’s own: 3 days → critical, then out', () => {
    expect(estimateStock(med(), taken(18), day(18, 1))).toMatchObject({ onHand: 6, daysLeft: 3, level: 'critical' })
    expect(estimateStock(med(), taken(21), day(21, 1))).toMatchObject({ onHand: 0, level: 'out' })
    expect(estimateStock(med(), taken(25), day(25, 1)).onHand).toBe(0)       // never negative
  })
})

describe('what does and does not use up tablets', () => {
  it('reminders that were sent, missed or are still ringing do NOT reduce the stock; they only make it uncertain', () => {
    const rs = [rem(1, 'ringing', day(1, 4)), rem(2, 'missed', day(1, 12)), rem(3, 'scheduled', day(1, 20)), rem(4, 'declined', day(2, 4))]
    const e = estimateStock(med(), rs, day(3))
    expect(e.onHand).toBe(42)
    expect(e).toMatchObject({ uncertain: true, unconfirmedDoses: 3, onHandIfUnconfirmedTaken: 39 })
    expect(e.message).toMatch(/not confirmed.*estimate.*check the actual count/s)
  })
  it('an explicitly SKIPPED dose does not use tablets and does not make the estimate uncertain', () => {
    const rs = [rem(1, 'skipped', day(1, 4)), rem(2, 'skipped', day(1, 12))]
    expect(estimateStock(med(), rs, day(3))).toMatchObject({ onHand: 42, uncertain: false, unconfirmedDoses: 0 })
  })
  it('a completed reminder that was not explicitly user-reported does not count', () => {
    expect(estimateStock(med(), [rem(1, 'completed', day(1), false)], day(2)).onHand).toBe(42)
  })
  it('doses of a different medicine are ignored', () => {
    const other = { ...rem(1, 'completed', day(1)), medicineId: 'other' }
    expect(estimateStock(med(), [other], day(2)).onHand).toBe(42)
  })
  it('a refill adds to what is on hand and resets the "last supply" the percentage is measured against', () => {
    const m = med(); m.stock!.ledger.push(txn('refill', 30, 'user', day(10)))
    const e = estimateStock(m, taken(10), day(10, 1))   // 42 − 20 = 22, +30 = 52
    expect(e).toMatchObject({ onHand: 52, pctLeft: 100, lastRefillAt: day(10).toISOString() })
    expect(e.daysLeft).toBe(26)
  })
  it('doses confirmed BEFORE tracking started are not subtracted', () => {
    const early = rem(1, 'completed', new Date(T0.getTime() - 86400000))
    expect(estimateStock(med(), [early], day(1)).onHand).toBe(42)
  })
})

describe('incomplete information is labelled, never guessed', () => {
  it('no stock entered', () => { expect(estimateStock({ ...med(), stock: undefined }, [], T0)).toMatchObject({ tracked: false, reason: 'no_stock', level: 'unknown' }) })
  it('no confirmed dose size → count is shown but no days-of-supply is invented', () => {
    const e = estimateStock(med({ perDose: 0 }), [], T0)
    expect(e).toMatchObject({ tracked: true, reason: 'no_dose_size', daysLeft: null, level: 'unknown', onHand: 42 })
  })
  it('no reminder times and no doses/day → no estimate', () => {
    const m = med(); m.times = []
    expect(estimateStock(m, [], T0)).toMatchObject({ reason: 'no_schedule', daysLeft: null })
  })
  it('reorder date is the run-out date minus the lead time', () => {
    const e = estimateStock(med({ leadDays: 4 }), [], T0)
    expect(e.runsOutOn).toBe('2026-10-22'); expect(e.reorderBy).toBe('2026-10-18')
  })
  it('input validation', () => {
    expect(validateStockInput({ qty: -1 })).toMatch(/0 or more/); expect(validateStockInput({ qty: 99999 })).toMatch(/too large/)
    expect(validateStockInput({ qty: 10, perDose: 0 })).toMatch(/each time/); expect(validateStockInput({ qty: 10, perDose: 1 })).toBeNull()
  })
})
