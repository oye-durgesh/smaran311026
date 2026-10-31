/**
 * Synthetic demo family for presentations. EVERYTHING here is invented and labelled "(demo)": names, readings, medicines, dates.
 *  - Never overwrites real data: refuses if the store holds anything that is not already demo data.
 *  - Never uploaded: `sampleData` stays true while it is loaded, and sync skips such a store.
 *  - Repeatable: `removeDemoFamily()` wipes the (demo-only) store, `seedDemoFamily()` builds it again from the current time.
 */
import * as A from '../store/actions'
import { now, store } from '../store/store'
import { blankMedicine } from '../domain/medicines'
import { txn } from '../domain/inventory'
import { newId } from '../domain/ids'
import { selfOf } from '../domain/people'
import type { Medicine, Reminder } from '../domain/types'

const DAY = 86400000
export type SeedResult = { ok: true; mum: string; papa: string } | { ok: false; error: string }

export function hasRealData(): boolean {
  const s = store.get()
  if (s.demo.demoFamily) return false
  return s.medicines.length + s.readings.length + s.appointments.length + s.reminders.length > 0 || s.people.some((p) => p.relationship !== 'self') || s.profile.onboarded && s.profile.name.trim().length > 0 && !s.demo.sampleData
}

export function seedDemoFamily(): SeedResult {
  if (hasRealData()) return { ok: false, error: 'This device already holds real family information, so the demo family was not loaded. Use a fresh browser profile for demos.' }
  A.withoutRinging(() => {
    store.replace({ ...store.get(), demo: { ...store.get().demo, sampleData: true, demoFamily: true } })
    A.updateProfile({ name: 'Durgesh (demo)', callName: 'Durgesh', email: 'demo@example.invalid', language: 'en', onboarded: true, signedIn: true, role: 'parent' })
  })
  const n = now()
  const iso = (offsetDays: number, h = 8, m = 0) => { const d = new Date(n.getTime() + offsetDays * DAY); d.setHours(h, m, 0, 0); return d.toISOString() }
  const mum = (A.addPerson({ relationship: 'mother', displayName: 'Sunita (demo)', greetingName: 'Mummy', language: 'hi' }) as { value: { person: { id: string } } }).value.person.id
  const papa = (A.addPerson({ relationship: 'father', displayName: 'Ramesh (demo)', greetingName: 'Papa', language: 'en' }) as { value: { person: { id: string } } }).value.person.id
  A.setPersonVoice(mum, 'mom')
  A.setPersonVoice(papa, 'dad')

  const addMed = (who: string, over: Partial<Medicine>): Medicine => {
    A.setActivePerson(who)
    const m: Medicine = { ...blankMedicine(store.get().profile.timeZone, n), source: 'manual', prescriber: 'Dr. Demo (synthetic)', status: 'confirmed', ...over }
    A.saveMedicine(m); return m
  }
  // Mummy: a 42-tablet supply started 14 days ago, 28 doses confirmed => about 14 tablets / 7 days left => refill alert
  const metformin = addMed(mum, { name: 'Metformin', strength: '500mg', dose: '1 tablet', frequency: 'twice', times: ['08:00', '20:00'], food: 'after', startDate: iso(-14).slice(0, 10), stock: { unit: 'tablet', perDose: 1, dosesPerDay: 0, lowDays: 7, ledger: [txn('opening', 42, 'user', new Date(n.getTime() - 14 * DAY - 60000))] } })
  addMed(papa, { name: 'Amlodipine', strength: '5mg', dose: '1 tablet', frequency: 'once', times: ['09:00'], food: 'none', stock: { unit: 'tablet', perDose: 1, dosesPerDay: 0, ledger: [txn('opening', 30, 'user', new Date(n.getTime() - 2 * DAY))] }, followUpDate: iso(12).slice(0, 10) })
  A.setActivePerson(mum); A.activateConfirmed()
  A.setActivePerson(papa); A.activateConfirmed()

  // history: confirmed doses for Mummy, readings, appointments
  const done: Reminder[] = Array.from({ length: 28 }, (_, i) => {
    const at = new Date(n.getTime() - 14 * DAY + i * 12 * 3600000).toISOString()
    return { id: newId('demo'), personId: mum, ownerId: 'me', kind: 'medicine', title: 'Metformin', medicineId: metformin.id, scheduledFor: at, originalScheduledFor: at, timeZone: store.get().profile.timeZone,
      status: 'completed', completedAt: at, completion: { via: 'tap', basis: 'user-reported' }, createdAt: at, updatedAt: at, snoozeHistory: [], rescheduleHistory: [], deliveryAttempts: [], idempotencyKey: `demo:${i}`, recurrence: null } as Reminder
  })
  store.set((s) => ({ ...s, reminders: [...s.reminders, ...done] }))
  A.setActivePerson(mum)
  A.saveReading({ type: 'sugar', at: iso(-2, 7, 30), value: 118, unit: 'mg/dL', context: 'fasting', source: 'sample' })
  A.saveReading({ type: 'bp', at: iso(-2, 7, 35), systolic: 128, diastolic: 82, pulse: 74, source: 'sample' })
  A.setActivePerson(papa)
  for (const [d, sys, dia] of [[-12, 152, 94], [-9, 148, 92], [-5, 138, 88], [-2, 134, 86]] as const) A.saveReading({ type: 'bp', at: iso(d, 9, 15), systolic: sys, diastolic: dia, source: 'sample' })
  A.saveAppointment({ title: 'Cardiology review (demo)', doctor: 'Dr. Demo (synthetic)', at: new Date(iso(5, 11, 0)), reminder: '1d' })
  A.setActivePerson(selfOf(store.get())!.id)
  A.setActivePerson(mum)
  return { ok: true, mum, papa }
}

/** Removes the demo family. Only ever wipes a store that is demo data; real data is refused. */
export async function removeDemoFamily(): Promise<{ ok: boolean; error?: string }> {
  if (!store.get().demo.demoFamily) return { ok: false, error: 'No demo family is loaded, so nothing was removed.' }
  await A.wipeAll(); return { ok: true }
}
