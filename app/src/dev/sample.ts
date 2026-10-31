/**
 * "Design sample" data: the people, medicines, readings and appointments shown in the approved design.
 * It is SAMPLE data for demos and tests, loaded only on request, and marked with demo.sampleData = true.
 */
import * as A from '../store/actions'
import { initialState } from '../store/defaults'
import { store } from '../store/store'
import { blankMedicine } from '../domain/medicines'
import { newId } from '../domain/ids'
import { zonedToUtc } from '../domain/time'

const TZ = 'Asia/Kolkata'
const at = (y: number, m: number, d: number, h: number, min: number) => zonedToUtc(y, m, d, h, min, TZ)

export function loadSample() {
  A.withoutRinging(() => {
    store.replace(initialState())
    // Pin "now" to Wed 29 Oct 2025, 07:30 IST so the morning doses can be created and completed with the real engine.
    const setNow = (d: Date) => store.set((s) => ({ ...s, demo: { ...s.demo, clockOffsetMs: d.getTime() - Date.now() } }))
    setNow(at(2025, 10, 29, 7, 30))
    A.updateProfile({
      name: 'Ramesh Kumar', callName: 'Mummy', email: 'demo@example.invalid', phone: '98765 43210', language: 'hi', timeZone: TZ, role: 'self',
      textSize: 'large', speakingSpeed: 'normal', reminderTone: 'gentle', onboarded: true, signedIn: true,
    })
    store.set((s) => ({ ...s, demo: { ...s.demo, sampleData: true }, prefs: { ...s.prefs, permissionAsked: { notifications: true, microphone: true } } }))

    const mk = (name: string, strength: string, frequency: 'once' | 'twice', times: string[], food: 'after' | 'none', extra = {}) => {
      const m = { ...blankMedicine(TZ, new Date(Date.now() + store.get().demo.clockOffsetMs)), name, strength, dose: '1 tablet', frequency, times, food, source: 'prescription' as const, ...extra }
      A.saveMedicine(m)
      return m
    }
    const met = mk('Metformin', '500mg', 'twice', ['08:00', '20:00'], 'after', { purpose: 'Diabetes', sourceText: 'Tab Metformin 500mg 1-0-1 after food' })
    const aml = mk('Amlodipine', '5mg', 'once', ['08:00'], 'none')
    const ato = mk('Atorvastatin', '10mg', 'once', ['22:00'], 'none')
    const eco = mk('Ecosprin', '75mg', 'once', [], 'after', { sourceText: 'Ecosprin 75 OD', flags: ['timing_unclear'] })
    // Ecosprin stays an unconfirmed draft (timing unclear), exactly as in the design.
    A.confirmMedicine(met); A.confirmMedicine(aml); A.confirmMedicine(ato)
    void eco
    A.activateConfirmed()

    const advance = (d: Date) => { setNow(d); A.tick() }
    advance(at(2025, 10, 29, 8, 4))
    for (const r of store.get().reminders.filter((x) => x.status === 'ringing' && x.scheduledFor === at(2025, 10, 29, 8, 0).toISOString())) {
      A.completeReminder(r.id, 'tap')
    }
    setNow(at(2025, 10, 29, 9, 41))
    A.tick()

    const rd = (type: 'sugar' | 'bp', when: Date, p: object) => A.saveReading({ type, at: when.toISOString(), source: 'sample', ...p } as never)
    rd('sugar', at(2025, 10, 27, 7, 45), { value: 120, unit: 'mg/dL', context: 'fasting' })
    rd('sugar', at(2025, 10, 28, 14, 15), { value: 165, unit: 'mg/dL', context: 'after_meal' })
    rd('bp', at(2025, 10, 28, 9, 0), { systolic: 130, diastolic: 80 })
    rd('sugar', at(2025, 10, 29, 7, 30), { value: 180, unit: 'mg/dL', context: 'fasting' })

    A.saveAppointment({ title: 'Dr. Sharma · Checkup', at: at(2025, 10, 31, 10, 0), reminder: 'evening_before' })
    A.saveAppointment({ title: 'Blood test · Lab', at: at(2025, 11, 3, 8, 0), notes: 'Fasting required', reminder: 'none' })
    store.set((s) => ({
      ...s,
      appointments: [...s.appointments, {
        id: newId('apt'), title: 'Dr. Sharma · Follow-up', at: at(2025, 10, 15, 10, 0).toISOString(), timeZone: TZ, reminder: 'none', status: 'completed',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }],
    }))

    const perms = { helpSetup: true, viewSchedule: true, viewReadings: false }
    store.set((s) => ({
      ...s,
      family: {
        ...s.family,
        members: [
          { id: newId('fam'), name: 'Anita Kumar', relation: 'Daughter', role: 'admin', status: 'active', permissions: { ...perms, viewReadings: true }, simulated: true },
          { id: newId('fam'), name: 'Vikram Kumar', relation: 'Son', role: 'read-only', status: 'pending', permissions: perms, simulated: true },
        ],
      },
    }))
    const m1 = store.get().medicines.find((m) => m.name === 'Metformin')!
    A.addProposal({ kind: 'change', medicineId: m1.id, title: 'Metformin 500mg', summary: 'Changed: 8 AM → 7:30 AM', patch: { times: ['07:30', '20:00'] }, by: 'Anita' })
    A.addProposal({
      kind: 'new', title: 'Vitamin D3', summary: 'Once daily · Morning · After food', by: 'Anita',
      newMedicine: { ...blankMedicine(TZ, new Date(), 'family'), name: 'Vitamin D3', strength: '60000 IU', dose: '1 capsule', times: ['08:00'], food: 'after', status: 'confirmed' },
    })
  })
}


/** Review-flow fixtures used by the design comparison tests and the demo panel. */
export function seedReview(allConfirmed = false) {
  A.withoutRinging(() => {
    loadSampleBase()
    const tz = TZ
    const n = new Date(Date.now() + store.get().demo.clockOffsetMs)
    const mk = (name: string, strength: string, frequency: 'once' | 'twice', times: string[], food: 'after' | null, extra = {}) => {
      const m = { ...blankMedicine(tz, n), name, strength, dose: '1 tablet', frequency, times, food, source: 'prescription' as const, extractionProvider: 'mock', ...extra }
      A.saveMedicine(m)
      return m
    }
    const m1 = mk('Metformin', '500mg', 'twice', ['08:00', '20:00'], 'after', { sourceText: 'Tab Metformin 500mg 1-0-1 after food' })
    const m2 = mk('Amlodipine', '5mg', 'once', ['08:00'], 'after')
    const m3 = mk('Ecosprin', '75mg', 'once', allConfirmed ? ['08:00'] : [], 'after', { sourceText: 'Ecosprin 75 OD', flags: allConfirmed ? [] : ['food_missing', 'timing_unclear'] })
    const m4 = mk('Atorvastatin', '10mg', 'once', ['22:00'], 'after')
    for (const m of [m1, m2]) A.confirmMedicine(m)
    if (allConfirmed) { A.confirmMedicine(m3); A.confirmMedicine(m4) } else { void m4 }
    store.set((s) => ({ ...s, setup: { ...s.setup, extraction: { batchId: 'x', provider: 'mock', at: n.toISOString(), isMock: false, rawText: '', outcome: 'success' } } }))
  })
}

function loadSampleBase() {
  store.replace(initialState())
  const target = at(2025, 10, 29, 9, 41)
  store.set((s) => ({ ...s, demo: { ...s.demo, clockOffsetMs: target.getTime() - Date.now() } }))
  A.updateProfile({ name: 'Ramesh Kumar', callName: 'Mummy', email: 'demo@example.invalid', phone: '98765 43210', language: 'hi', timeZone: TZ, onboarded: true, signedIn: true })
}
