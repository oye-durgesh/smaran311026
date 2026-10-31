import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as A from '../../store/actions'
import { store, now } from '../../store/store'
import { initialState } from '../../store/defaults'
import { blankMedicine } from '../medicines'
import * as R from '../reminders'
import { createReminder } from './helpers'

const T0 = new Date('2026-10-29T04:30:00Z') // Wed 29 Oct 2026 10:00 IST
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(T0)
  store.replace(initialState())
})
const min = (n: number) => vi.setSystemTime(new Date(now().getTime() + n * 60000))

describe('state machine', () => {
  it('create → trigger → snooze → trigger again → complete (one reminder throughout)', () => {
    const c = A.createReminder({ title: 'Call doctor', when: new Date(T0.getTime() + 10 * 60000) })
    expect(c.ok).toBe(true)
    const id = (c as any).value.reminder.id
    expect(A.tick()).toHaveLength(0)
    min(10)
    const fired = A.tick()
    expect(fired.map((r) => r.id)).toEqual([id])
    expect(store.get().reminders[0].status).toBe('ringing')
    // delivery tracking
    expect(store.get().reminders[0].deliveryAttempts).toHaveLength(1)
    // ticking again must not re-ring or add attempts
    expect(A.tick()).toHaveLength(0)
    expect(store.get().reminders[0].deliveryAttempts).toHaveLength(1)

    const s = A.snoozeReminder(id, 10)
    expect(s.ok).toBe(true)
    expect(store.get().reminders).toHaveLength(1)           // no duplicate occurrence
    expect(store.get().reminders[0].status).toBe('snoozed')
    expect(store.get().reminders[0].snoozeHistory).toHaveLength(1)
    min(9); expect(A.tick()).toHaveLength(0)
    min(1); expect(A.tick()).toHaveLength(1)
    expect(store.get().reminders[0].status).toBe('ringing')
    expect(store.get().reminders[0].deliveryAttempts).toHaveLength(2)

    expect(A.completeReminder(id, 'voice').ok).toBe(true)
    const done = store.get().reminders[0]
    expect(done.status).toBe('completed'); expect(done.completedAt).toBeTruthy()
    expect(done.completion?.basis).toBe('user-reported') // delivered ≠ taken
    expect(A.snoozeReminder(id, 5).ok).toBe(false)         // terminal state
  })

  it('rejects invalid snooze lengths and past times', () => {
    const r = createReminder('x', new Date(T0.getTime() + 1000))
    expect(() => R.snooze(R.fireDue([r], new Date(T0.getTime() + 2000)).reminders[0], 7, T0)).toThrow()
    expect(A.createReminder({ title: 'x', when: new Date(T0.getTime() - 1000) }).ok).toBe(false)
  })

  it('reschedule moves the same reminder and records history; cancel is terminal', () => {
    const id = (A.createReminder({ title: 'Walk', when: new Date(T0.getTime() + 3600_000) }) as any).value.reminder.id
    const when = new Date(T0.getTime() + 86400_000)
    expect(A.rescheduleReminder(id, when).ok).toBe(true)
    const r = store.get().reminders[0]
    expect(r.scheduledFor).toBe(when.toISOString()); expect(r.rescheduleHistory).toHaveLength(1)
    expect(A.rescheduleReminder(id, new Date(T0.getTime() - 5000)).ok).toBe(false)
    expect(A.cancelReminder(id).ok).toBe(true)
    expect(A.completeReminder(id, 'tap').ok).toBe(false)
    expect(R.history(store.get().reminders)).toHaveLength(1)
  })

  it('duplicate creation is idempotent', () => {
    const when = new Date(T0.getTime() + 3600_000)
    const a = A.createReminder({ title: 'Call doctor', when }) as any
    const b = A.createReminder({ title: 'call doctor ', when }) as any
    expect(b.value.duplicate).toBe(true)
    expect(store.get().reminders).toHaveLength(1)
    expect(a.value.reminder.id).toBe(b.value.reminder.id)
  })

  it('unanswered reminder becomes missed after the grace window; late completion allowed', () => {
    const id = (A.createReminder({ title: 'Walk', when: new Date(T0.getTime() + 60000) }) as any).value.reminder.id
    min(1); A.tick(); expect(store.get().reminders[0].status).toBe('ringing')
    min(61); A.tick(); expect(store.get().reminders[0].status).toBe('missed')
    expect(A.completeReminder(id, 'manual').ok).toBe(true)
  })

  it('decline keeps it needing attention; can still be snoozed', () => {
    const id = (A.createReminder({ title: 'Walk', when: new Date(T0.getTime() + 60000) }) as any).value.reminder.id
    min(1); A.tick()
    expect(A.declineReminder(id).ok).toBe(true)
    expect(store.get().reminders[0].status).toBe('declined')
    expect(A.snoozeReminder(id, 15).ok).toBe(true)
  })

  it('skip is recorded, terminal, never confused with taken, and is not rung again', () => {
    const id = (A.createReminder({ title: 'Walk', when: new Date(T0.getTime() + 60000) }) as any).value.reminder.id
    min(1); A.tick()
    expect(A.skipReminder(id).ok).toBe(true)
    const r = store.get().reminders[0]
    expect(r.status).toBe('skipped'); expect(r.skippedAt).toBeTruthy(); expect(r.completion).toBeUndefined()
    expect(A.completeReminder(id, 'tap').ok).toBe(false); expect(A.snoozeReminder(id, 10).ok).toBe(false)
    min(60); A.tick(); expect(store.get().reminders[0].status).toBe('skipped')
  })

  it('refresh recovery: a reminder due while the app was closed rings on next tick, not twice', () => {
    const id = (A.createReminder({ title: 'Walk', when: new Date(T0.getTime() + 5 * 60000) }) as any).value.reminder.id
    const snapshot = JSON.stringify(store.get())
    store.replace(JSON.parse(snapshot))                      // simulate reload
    min(7)
    expect(A.tick().map((r) => r.id)).toEqual([id])
    expect(A.tick()).toHaveLength(0)
  })
})

describe('medicine recurrence', () => {
  function activeMed(times: string[], extra = {}) {
    const m = { ...blankMedicine('Asia/Kolkata', now()), name: 'Metformin', strength: '500mg', dose: '1 tablet', frequency: (times.length === 1 ? 'once' : 'twice') as 'once' | 'twice', times, food: 'after' as const, ...extra }
    A.saveMedicine(m)
    expect(A.confirmMedicine(m).ok).toBe(true)
    expect(A.activateConfirmed().ok).toBe(true)
    return m.id
  }

  it('activation creates today/tomorrow occurrences once each; re-ticking never duplicates', () => {
    activeMed(['20:00', '22:00'])
    const n1 = store.get().reminders.length
    expect(n1).toBe(6) // 2 times × (today + 2 days)
    A.tick(); A.tick()
    expect(store.get().reminders).toHaveLength(n1)
    const keys = store.get().reminders.map((r) => r.idempotencyKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('does not back-fill times that were already past at activation', () => {
    activeMed(['08:00', '20:00']) // activated at 10:00 IST
    const today = store.get().reminders.filter((r) => r.scheduledFor.startsWith('2026-10-29'))
    expect(today.map((r) => r.scheduledFor)).toEqual(['2026-10-29T14:30:00.000Z']) // only 20:00 IST today
  })

  it('rolls forward daily and keeps one occurrence per day', () => {
    activeMed(['20:00'])
    vi.setSystemTime(new Date('2026-10-31T10:00:00Z')); A.tick()
    const days = store.get().reminders.map((r) => r.scheduledFor.slice(0, 10))
    expect(new Set(days).size).toBe(days.length)
  })

  it('editing times cancels removed future occurrences and keeps completed history', () => {
    const id = activeMed(['20:00'])
    const first = store.get().reminders.find((r) => r.scheduledFor === '2026-10-29T14:30:00.000Z')!
    min(10 * 60 + 5) // 20:05 IST
    A.tick(); A.completeReminder(first.id, 'tap')
    const med = A.getMedicine(id)!
    A.saveMedicine({ ...med, times: ['21:00'], frequency: 'once' }); A.resyncMedicine(id)
    const st = store.get()
    expect(st.reminders.find((r) => r.id === first.id)!.status).toBe('completed')
    expect(st.reminders.filter((r) => r.status === 'cancelled').length).toBeGreaterThan(0)
    expect(st.reminders.some((r) => r.status === 'scheduled' && r.scheduledFor.includes('15:30'))).toBe(true) // 21:00 IST
  })

  it('draft medicines never create reminders; pausing cancels future ones; remove cancels', () => {
    const m = { ...blankMedicine('Asia/Kolkata', now()), name: 'X', strength: '1mg', dose: '1', frequency: 'once' as const, times: ['21:00'], food: 'none' as const }
    A.saveMedicine(m); A.tick()
    expect(store.get().reminders).toHaveLength(0)
    expect(A.activateConfirmed().ok).toBe(false)           // nothing confirmed yet → nothing to activate
    A.confirmMedicine(m); expect(A.activateConfirmed().ok).toBe(true)
    expect(store.get().reminders.length).toBeGreaterThan(0)
    A.setMedicinePaused(m.id, true)
    expect(store.get().reminders.every((r) => r.status === 'cancelled')).toBe(true)
    A.setMedicinePaused(m.id, false)
    expect(store.get().reminders.some((r) => r.status === 'scheduled')).toBe(true)
    A.removeMedicine(m.id)
    expect(store.get().reminders.filter((r) => r.status === 'scheduled')).toHaveLength(0)
  })

  it('only confirmed medicines are activated; unconfirmed drafts stay separate with no reminders', () => {
    const a = { ...blankMedicine('Asia/Kolkata', now()), name: 'A', strength: '1mg', dose: '1', times: ['21:00'], frequency: 'once' as const, food: 'none' as const }
    const b = { ...blankMedicine('Asia/Kolkata', now()), name: 'B' }
    A.saveMedicine(a); A.saveMedicine(b); A.confirmMedicine(a)
    expect(A.activateConfirmed().ok).toBe(true)
    const st = store.get()
    expect(st.medicines.find((m) => m.id === a.id)!.status).toBe('active')
    expect(st.medicines.find((m) => m.id === b.id)!.status).toBe('draft')
    expect(st.reminders.every((r) => r.medicineId === a.id)).toBe(true)
  })
})

describe('server-side contract: time zones', () => {
  it('computes IST wall time correctly', () => {
    const d = new Date('2026-10-29T14:30:00Z')
    expect(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(d)).toBe('20:00')
  })
})
