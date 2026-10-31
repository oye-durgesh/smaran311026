import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as A from '../../store/actions'
import { initialState } from '../../store/defaults'
import { store } from '../../store/store'
import { handleUtterance, type Convo } from '../../voice/brain'

const T0 = new Date('2026-10-29T04:30:00Z') // 10:00 IST
let id: string
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(T0)
  store.replace(initialState())
  A.updateProfile({ callName: 'Mummy', name: 'Ramesh' })
  const r = (A.createReminder({ title: 'Metformin 500mg', when: new Date(T0.getTime() + 60000) }) as any).value.reminder
  id = r.id
  A.updateProfile({}) // noop
  vi.setSystemTime(new Date(T0.getTime() + 61000)); A.tick()
})
const say = (t: string, c: Convo, lang: 'hi' | 'en' = 'hi') => handleUtterance(t, c, lang)
const st = () => store.get().reminders.find((r) => r.id === id)!

describe('voice brain – reminder call', () => {
  it('"Haan, le li maine" completes as user-reported', () => {
    // the call is about a medicine reminder
    store.set((s) => ({ ...s, reminders: s.reminders.map((r) => ({ ...r, kind: 'medicine' as const })) }))
    const res = say('Haan, le li maine.', { reminderId: id })
    expect(res.end).toBe('taken'); expect(st().status).toBe('completed'); expect(st().completion?.basis).toBe('user-reported')
  })
  it('"nahi" then "10 minute baad" snoozes the same reminder', () => {
    store.set((s) => ({ ...s, reminders: s.reminders.map((r) => ({ ...r, kind: 'medicine' as const })) }))
    const a = say('abhi nahi', { reminderId: id })
    expect(a.end).toBeUndefined(); expect(a.convo.expectSnooze).toBe(true); expect(st().status).toBe('ringing')
    const b = say('10 minute baad', a.convo)
    expect(b.end).toBe('snoozed'); expect(st().status).toBe('snoozed'); expect(st().snoozeHistory[0].minutes).toBe(10)
    expect(store.get().reminders).toHaveLength(1)
  })
  it('"10 minute baad" during the call snoozes; "Ho gaya" completes', () => {
    expect(say('10 minute baad', { reminderId: id }).end).toBe('snoozed')
    expect(st().status).toBe('snoozed')
  })
  it('does not complete on an unrelated sentence', () => {
    store.set((s) => ({ ...s, reminders: s.reminders.map((r) => ({ ...r, kind: 'medicine' as const })) }))
    const res = say('mausam kaisa hai', { reminderId: id })
    expect(res.end).toBeUndefined(); expect(st().status).toBe('ringing')
  })
})

describe('voice brain – assistant', () => {
  it('creates, lists, asks for clarification without guessing', () => {
    const a = say('Kal subah 9 baje medicine yaad dilana', {})
    expect(a.end).toBe('created')
    const l = say('Mere saare reminders batao', {})
    expect(l.line.text).toMatch(/reminder/i)
    const c = say('Kal subah dawa yaad dilana', {})
    expect(c.convo.pending).toBeTruthy(); expect(c.end).toBeUndefined()
    const c2 = say('9 baje', c.convo)
    expect(c2.end).toBe('created')
  })
  it('health reading needs an explicit yes before saving', () => {
    const a = say('Mera sugar aaj 180 aaya, breakfast se pehle', {}, 'hi')
    expect(store.get().readings).toHaveLength(0)
    expect(a.convo.confirm).toBeTruthy()
    const no = say('nahi', a.convo); expect(store.get().readings).toHaveLength(0); expect(no.end).toBeUndefined()
    const a2 = say('sugar 180', {})
    const yes = say('haan', a2.convo); expect(yes.end).toBe('saved-reading')
    expect(store.get().readings[0]).toMatchObject({ type: 'sugar', value: 180, source: 'voice' })
  })
  it('rejects implausible readings', () => {
    const r = say('sugar 5000', {})
    expect(r.convo.confirm).toBeFalsy()
  })
})
