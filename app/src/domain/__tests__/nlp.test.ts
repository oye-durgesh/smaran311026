import { describe, expect, it } from 'vitest'
import { parseCommand } from '../nlp'
import { createReminder, ringing } from './helpers'

const TZ = 'Asia/Kolkata'
// Wed 29 Oct 2026, 10:00 IST
const now = new Date('2026-10-29T04:30:00Z')
const ctx = (extra = {}) => ({ now, tz: TZ, reminders: [], ...extra })
const hhmm = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)

describe('nlp create', () => {
  it('Kal subah 9 baje medicine yaad dilana', () => {
    const i = parseCommand('Kal subah 9 baje medicine yaad dilana.', ctx())
    expect(i.type).toBe('create')
    if (i.type !== 'create') return
    expect(day(i.when)).toBe('2026-10-30'); expect(hhmm(i.when)).toBe('09:00'); expect(i.title.toLowerCase()).toBe('medicine')
  })
  it('Remind me to call the doctor at 5 PM', () => {
    const i = parseCommand('Remind me to call the doctor at 5 PM', ctx())
    expect(i.type).toBe('create')
    if (i.type !== 'create') return
    expect(day(i.when)).toBe('2026-10-29'); expect(hhmm(i.when)).toBe('17:00'); expect(i.title).toBe('Call the doctor')
  })
  it('Aaj shaam 7 baje walk karni hai', () => {
    const i = parseCommand('Aaj shaam 7 baje walk karni hai.', ctx())
    expect(i.type).toBe('create')
    if (i.type !== 'create') return
    expect(hhmm(i.when)).toBe('19:00'); expect(i.title).toBe('Walk')
  })
  it('Devanagari input', () => {
    const i = parseCommand('कल सुबह 9 बजे दवा याद दिलाना', ctx())
    expect(i.type).toBe('create')
    if (i.type !== 'create') return
    expect(day(i.when)).toBe('2026-10-30'); expect(hhmm(i.when)).toBe('09:00')
  })
  it('asks when the hour has no am/pm', () => {
    const i = parseCommand('Remind me to call Anita at 5', ctx())
    expect(i.type).toBe('clarify')
  })
  it('asks instead of silently picking tomorrow when the time has passed', () => {
    const i = parseCommand('Remind me to call the doctor at 9 AM', ctx())
    expect(i.type).toBe('clarify')
    if (i.type !== 'clarify') return
    const next = parseCommand('haan', ctx({ pending: i.pending }))
    expect(next.type).toBe('create')
    if (next.type !== 'create') return
    expect(day(next.when)).toBe('2026-10-30')
  })
  it('asks for the hour when only "kal subah" is given, and a follow-up completes it', () => {
    const i = parseCommand('Kal subah medicine yaad dilana', ctx())
    expect(i.type).toBe('clarify')
    if (i.type !== 'clarify') return
    const next = parseCommand('9 baje', ctx({ pending: i.pending }))
    expect(next.type).toBe('create')
    if (next.type !== 'create') return
    expect(day(next.when)).toBe('2026-10-30'); expect(hhmm(next.when)).toBe('09:00')
  })
})

describe('nlp snooze / complete / list / reschedule', () => {
  it('10 minute baad snoozes the ringing reminder', () => {
    const r = ringing('Metformin 500mg', now)
    expect(parseCommand('10 minute baad', ctx({ active: r }))).toEqual({ type: 'snooze', minutes: 10 })
    expect(parseCommand('10 मिनट बाद', ctx({ active: r }))).toEqual({ type: 'snooze', minutes: 10 })
    expect(parseCommand('remind me in 5 minutes', ctx({ active: r }))).toEqual({ type: 'snooze', minutes: 5 })
  })
  it('10 minute baad yaad dilana with nothing ringing asks what for', () => {
    expect(parseCommand('10 minute baad yaad dilana', ctx()).type).toBe('clarify')
  })
  it('non-standard snooze becomes a reschedule', () => {
    const r = ringing('Metformin 500mg', now)
    const i = parseCommand('20 minute baad', ctx({ active: r }))
    expect(i.type).toBe('reschedule')
  })
  it('Ho gaya completes', () => {
    expect(parseCommand('Ho gaya', ctx()).type).toBe('complete')
    expect(parseCommand('Ho gaya, mark the reminder completed.', ctx()).type).toBe('complete')
    expect(parseCommand('le li maine', ctx()).type).toBe('complete')
  })
  it('lists reminders', () => {
    expect(parseCommand('Mere saare reminders batao.', ctx()).type).toBe('list')
    expect(parseCommand('show my reminders', ctx()).type).toBe('list')
  })
  it('reschedules with an incomplete time by asking', () => {
    const r = createReminder('Call doctor', new Date('2026-10-29T11:30:00Z'))
    const i = parseCommand('Is reminder ko kal subah reschedule kar do.', ctx({ reminders: [r], active: r }))
    expect(i.type).toBe('clarify')
  })
  it('reschedules with a full time', () => {
    const r = createReminder('Call doctor', new Date('2026-10-29T11:30:00Z'))
    const i = parseCommand('reschedule this reminder to tomorrow 8 am', ctx({ reminders: [r], active: r }))
    expect(i.type).toBe('reschedule')
    if (i.type !== 'reschedule') return
    expect(day(i.when)).toBe('2026-10-30'); expect(hhmm(i.when)).toBe('08:00'); expect(i.target).toBe(r.id)
  })
})

describe('nlp health', () => {
  it('parses sugar and bp', () => {
    const s = parseCommand('Mera sugar aaj 180 aaya, breakfast se pehle', ctx())
    expect(s).toMatchObject({ type: 'health', reading: { type: 'sugar', value: 180, context: 'before_meal' } })
    const b = parseCommand('BP 130/80 pulse 72', ctx())
    expect(b).toMatchObject({ type: 'health', reading: { type: 'bp', systolic: 130, diastolic: 80, pulse: 72 } })
  })
})
