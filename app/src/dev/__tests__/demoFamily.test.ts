import { beforeEach, describe, expect, it } from 'vitest'
import * as A from '../../store/actions'
import { initialState } from '../../store/defaults'
import { store, now } from '../../store/store'
import { removeDemoFamily, seedDemoFamily } from '../demoFamily'
import { estimateStock, stockAlerts } from '../../domain/inventory'
import { healthCard } from '../../domain/healthcard'
import { integrityProblems } from '../../domain/people'

beforeEach(() => { store.replace(initialState()) })
const forPerson = (id: string) => { const s = store.get(); return { meds: s.medicines.filter((m) => m.personId === id), rems: s.reminders.filter((r) => r.personId === id), reads: s.readings.filter((r) => r.personId === id), appts: s.appointments.filter((a) => a.personId === id) } }

describe('synthetic demo family', () => {
  it('builds Mummy and Papa as separate, clearly-labelled demo profiles and is never uploaded', () => {
    const r = seedDemoFamily(); expect(r.ok).toBe(true); if (!r.ok) return
    const s = store.get()
    expect(s.demo).toMatchObject({ demoFamily: true, sampleData: true })        // sync skips a store flagged sampleData
    expect(s.people.filter((p) => p.relationship !== 'self').map((p) => p.displayName).sort()).toEqual(['Ramesh (demo)', 'Sunita (demo)'])
    expect(s.people.find((p) => p.relationship === 'mother')?.sathiVoice).toBe('mom')
    expect(s.people.find((p) => p.relationship === 'father')?.sathiVoice).toBe('dad')
    expect(s.profile.name).toMatch(/demo/i)
    expect(integrityProblems(s)).toEqual([])
  })
  it('records stay separate: Mummy’s medicines/readings are not Papa’s', () => {
    const r = seedDemoFamily(); if (!r.ok) throw new Error(r.error)
    const m = forPerson(r.mum), p = forPerson(r.papa)
    expect(m.meds.map((x) => x.name)).toEqual(['Metformin']); expect(p.meds.map((x) => x.name)).toEqual(['Amlodipine'])
    expect(m.reads.map((x) => x.type).sort()).toEqual(['bp', 'sugar']); expect(p.reads.every((x) => x.type === 'bp')).toBe(true)
    expect(m.appts).toHaveLength(0); expect(p.appts).toHaveLength(1)
    expect(m.rems.every((x) => x.personId === r.mum)).toBe(true)
  })
  it('Mummy’s stock estimate shows the refill warning from CONFIRMED doses; Papa has none', () => {
    const r = seedDemoFamily(); if (!r.ok) throw new Error(r.error)
    const mum = forPerson(r.mum), papa = forPerson(r.papa)
    const e = estimateStock(mum.meds[0], store.get().reminders, now())
    expect(e.onHand).toBe(14); expect(e.daysLeft).toBe(7); expect(e.level).toBe('low')
    const alerts = stockAlerts(mum.meds, store.get().reminders, now(), 'Sunita (demo)')
    expect(alerts[0].text).toMatch(/may need a refill soon\. Approximately 7 days of supply remain/)
    expect(stockAlerts(papa.meds, store.get().reminders, now(), 'Ramesh (demo)')).toEqual([])
  })
  it('health cards use only the recorded demo values; Papa’s BP trend is computed from his own four readings', () => {
    const r = seedDemoFamily(); if (!r.ok) throw new Error(r.error)
    const mum = forPerson(r.mum), papa = forPerson(r.papa)
    const c = healthCard(mum.reads, mum.appts, mum.meds, now())
    expect(c.sugar!.reading).toMatchObject({ value: 118, context: 'fasting', source: 'sample' }); expect(c.sugar!.stale).toBe(false)
    expect(healthCard(papa.reads, papa.appts, papa.meds, now()).bpTrend.kind).toBe('falling')
    expect(healthCard(papa.reads, papa.appts, papa.meds, now()).followUp?.label).toMatch(/Cardiology/)
  })
  it('active medicines have real scheduled reminders for the right person', () => {
    const r = seedDemoFamily(); if (!r.ok) throw new Error(r.error)
    const sched = (id: string) => forPerson(id).rems.filter((x) => x.status === 'scheduled' || x.status === 'ringing')
    expect(sched(r.mum).length).toBeGreaterThan(0); expect(sched(r.papa).length).toBeGreaterThan(0)
    expect(sched(r.mum).every((x) => x.title.includes('Metformin') || x.kind !== 'medicine')).toBe(true)
  })
  it('never overwrites real data', () => {
    A.updateProfile({ name: 'Real User', onboarded: true })
    A.addPerson({ relationship: 'mother', displayName: 'Real Mum' })
    const r = seedDemoFamily(); expect(r.ok).toBe(false)
    expect(store.get().people.some((p) => p.displayName === 'Real Mum')).toBe(true)
    expect(store.get().demo.demoFamily).toBeFalsy()
  })
  it('is repeatable: remove, then seed again gives the same shape; removing when no demo is loaded is refused', async () => {
    expect((await removeDemoFamily()).ok).toBe(false)
    const a = seedDemoFamily(); expect(a.ok).toBe(true)
    expect((await removeDemoFamily()).ok).toBe(true); expect(store.get().people.filter((p) => p.relationship !== 'self')).toHaveLength(0)
    const b = seedDemoFamily(); expect(b.ok).toBe(true); expect(store.get().people.filter((p) => p.relationship !== 'self')).toHaveLength(2)
    expect(seedDemoFamily().ok).toBe(true)                                  // seeding on top of the demo itself is allowed…
    expect(store.get().people.filter((p) => p.relationship === 'mother')).toHaveLength(1) // …and never duplicates profiles
  })
})
