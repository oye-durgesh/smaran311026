import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as A from '../../store/actions'
import { initialState } from '../../store/defaults'
import { store } from '../../store/store'
import { effectiveSettings, integrityProblems, selfOf, voicePersona } from '../people'
import { blankMedicine } from '../medicines'

const T0 = new Date('2026-10-29T04:30:00Z') // 10:00 IST
let mum: string, papa: string, me: string
const med = (name: string) => { const m = { ...blankMedicine('Asia/Kolkata', T0), name, strength: '500mg', dose: '1 tablet', times: ['08:00'], food: 'after' as const, status: 'confirmed' as const }; A.saveMedicine(m); return m.id }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(T0)
  store.replace(initialState())
  A.updateProfile({ name: 'Durgesh', callName: 'Durgesh', language: 'en' })
  me = selfOf(store.get())!.id
  mum = (A.addPerson({ relationship: 'mother', displayName: 'Sunita', greetingName: 'Mummy' }) as any).value.person.id
  papa = (A.addPerson({ relationship: 'father', displayName: 'Ramesh', greetingName: 'Papa' }) as any).value.person.id
})

describe('family profiles', () => {
  it('Mummy and Papa are separate profiles with separate stable ids; the account holder is a third, "self"', () => {
    const ids = store.get().people.map((p) => p.id)
    expect(new Set(ids).size).toBe(3)
    expect(store.get().people.map((p) => p.relationship).sort()).toEqual(['father', 'mother', 'self'])
  })
  it('the greeting name is not the identity: changing it keeps the id, and two people may share one', () => {
    A.updatePerson(mum, { greetingName: 'Amma' })
    expect(store.get().people.find((p) => p.id === mum)).toMatchObject({ id: mum, relationship: 'mother', greetingName: 'Amma' })
    A.updatePerson(papa, { greetingName: 'Amma' })
    expect(new Set(store.get().people.map((p) => p.id)).size).toBe(3)
  })
  it('choosing "Mummy" as how Sathi addresses the account holder does NOT make Mummy the active profile', () => {
    A.updateProfile({ callName: 'Mummy' })
    expect(effectiveSettings(store.get())).toMatchObject({ personId: me, relationship: 'self', address: 'Mummy' })
    expect(store.get().people.find((p) => p.id === mum)!.displayName).toBe('Sunita')
  })
  it('adding the same parent twice (resumed or double-submitted onboarding) returns the existing profile', () => {
    const again = A.addPerson({ relationship: 'mother', displayName: 'Someone else' }) as any
    expect(again.value.created).toBe(false); expect(again.value.person.id).toBe(mum)
    expect(store.get().people.filter((p) => p.relationship === 'mother')).toHaveLength(1)
    const d1 = A.addPerson({ relationship: 'other', relationshipLabel: 'Dadi' }) as any
    const d2 = A.addPerson({ relationship: 'other', relationshipLabel: ' dadi ' }) as any
    expect(d2.value.person.id).toBe(d1.value.person.id)
    expect(A.addPerson({ relationship: 'other', relationshipLabel: ' ' }).ok).toBe(false)
  })
  it('archiving hides a profile but keeps its records; restoring brings it back', () => {
    A.setActivePerson(mum); med('Metformin')
    A.archivePerson(mum)
    expect(store.get().activePersonId).toBe(me)
    expect(store.get().medicines).toHaveLength(1)
    expect(A.setActivePerson(mum).ok).toBe(false)
    A.restorePerson(mum); expect(A.setActivePerson(mum).ok).toBe(true)
    expect(A.archivePerson(me).ok).toBe(false)
  })
})

describe('records stay with the right person', () => {
  it('each profile loads only its own medicines, readings and appointments', () => {
    A.setActivePerson(mum); med('Metformin'); A.saveReading({ type: 'sugar', at: T0.toISOString(), value: 110, unit: 'mg/dL', context: 'fasting', source: 'manual' })
    A.setActivePerson(papa); med('Amlodipine')
    expect(store.view().medicines.map((m) => m.name)).toEqual(['Amlodipine'])
    expect(store.view().readings).toHaveLength(0)
    A.setActivePerson(mum)
    expect(store.view().medicines.map((m) => m.name)).toEqual(['Metformin'])
    expect(store.view().readings).toHaveLength(1)
    expect(store.get().medicines).toHaveLength(2)
    expect(integrityProblems(store.get())).toEqual([])
  })
  it('activating Mummy’s medicines creates reminders for Mummy only; Papa’s confirmed medicine stays untouched', () => {
    A.setActivePerson(mum); med('Metformin')
    A.setActivePerson(papa); med('Amlodipine')
    A.setActivePerson(mum); expect(A.activateConfirmed().ok).toBe(true)
    const s = store.get()
    expect(s.medicines.find((m) => m.name === 'Metformin')!.status).toBe('active')
    expect(s.medicines.find((m) => m.name === 'Amlodipine')!.status).toBe('confirmed')
    expect(s.reminders.length).toBeGreaterThan(0)
    expect(s.reminders.every((r) => r.personId === mum)).toBe(true)
    expect(s.series.every((x) => x.personId === mum)).toBe(true)
    A.setActivePerson(papa)
    expect(store.view().reminders).toHaveLength(0)
    expect(integrityProblems(s)).toEqual([])
  })
  it('a custom reminder made while Papa is active belongs to Papa and is invisible to Mummy', () => {
    A.setActivePerson(papa)
    const r = (A.createReminder({ title: 'Walk', when: new Date(T0.getTime() + 3600_000) }) as any).value.reminder
    expect(store.get().reminders.find((x) => x.id === r.id)!.personId).toBe(papa)
    A.setActivePerson(mum); expect(store.view().reminders).toHaveLength(0)
  })
  it('a record’s person never changes after creation', () => {
    A.setActivePerson(mum); const id = med('Metformin')
    A.setActivePerson(papa)
    A.saveMedicine({ ...store.get().medicines.find((m) => m.id === id)!, notes: 'edited while Papa is active' })
    expect(store.get().medicines.find((m) => m.id === id)!.personId).toBe(mum)
  })
  it('the integrity check catches a record attached to a person that does not exist', () => {
    A.setActivePerson(mum); med('Metformin')
    const broken = { ...store.get(), medicines: store.get().medicines.map((m) => ({ ...m, personId: 'per_ghost' })) }
    expect(integrityProblems(broken)[0]).toMatch(/no valid person/)
  })
})

describe('per-person settings and voice', () => {
  it('each profile has its own language, speed and Sathi voice; switching the active profile switches them', () => {
    A.updatePerson(mum, { language: 'hi', speakingSpeed: 'slower' }); A.setPersonVoice(mum, 'mom')
    A.updatePerson(papa, { language: 'en' }); A.setPersonVoice(papa, 'dad')
    A.setActivePerson(mum); expect(effectiveSettings(store.get())).toMatchObject({ language: 'hi', speakingSpeed: 'slower', address: 'Mummy' }); expect(voicePersona(store.get())).toBe('mom')
    A.setActivePerson(papa); expect(effectiveSettings(store.get())).toMatchObject({ language: 'en', address: 'Papa' }); expect(voicePersona(store.get())).toBe('dad')
    A.setActivePerson(me); expect(voicePersona(store.get())).toBe('default')
  })
  it('Mummy maps to mom and Papa to dad even when the voice chip is still Default', () => {
    A.setActivePerson(mum); expect(voicePersona(store.get())).toBe('mom')
    A.setActivePerson(papa); expect(voicePersona(store.get())).toBe('dad')
    A.setPersonVoice(mum, 'dad'); A.setActivePerson(mum); expect(voicePersona(store.get())).toBe('dad')
  })
  it('voice-cloning consent lives in preferences, separate from the form of address', () => {
    A.updateProfile({ callName: 'Mummy' }); A.updatePrefs({ voiceCloningConsent: true })
    expect(store.get().prefs.voiceCloningConsent).toBe(true)
    expect(store.get().profile.callName).toBe('Mummy')
  })
})

describe('stock actions', () => {
  it('opening count, refill and recount keep a dated, sourced ledger on the right person’s medicine', () => {
    A.setActivePerson(mum)
    const id = med('Metformin')
    A.setStockSettings(id, { perDose: 1, lowDays: 7 })
    expect(A.recordStock(id, 'opening', 42, 'count').ok).toBe(true)
    A.recordStock(id, 'refill', 30, 'user', 'Bought at pharmacy')
    const m = store.get().medicines.find((x) => x.id === id)!
    expect(m.personId).toBe(mum)
    expect(m.stock!.ledger.map((t) => [t.type, t.qty, t.source])).toEqual([['opening', 42, 'count'], ['refill', 30, 'user']])
    expect(m.stock!.ledger.every((t) => !!t.at)).toBe(true)
    A.recountStock(id, 60)
    const est = (A as any)
    expect(store.get().medicines.find((x) => x.id === id)!.stock!.ledger.slice(-1)[0]).toMatchObject({ type: 'consumed', qty: 12, source: 'count', note: 'recount' })
    expect(est).toBeTruthy()
  })
  it('refuses nonsense quantities and unknown medicines', () => {
    A.setActivePerson(mum); const id = med('Metformin')
    expect(A.recordStock(id, 'refill', 0).ok).toBe(false); expect(A.recordStock(id, 'refill', -3).ok).toBe(false); expect(A.recordStock('nope', 'refill', 5).ok).toBe(false)
    expect(A.setStockSettings(id, { perDose: 0 }).ok).toBe(false)
    expect(A.recountStock(id, 5).ok).toBe(false) // not tracked yet
  })
})
