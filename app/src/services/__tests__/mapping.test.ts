import { describe, expect, it } from 'vitest'
import * as M from '../mapping'
import { blankMedicine } from '../../domain/medicines'
import { createReminder, materialize } from '../../domain/reminders'
import { newIdFor } from '../pushId'

const uid = '00000000-0000-0000-0000-00000000000a'
const now = new Date('2026-10-29T04:30:00Z')

describe('family profile mapping', () => {
  const person = { id: 'per_mum1', relationship: 'mother' as const, relationshipLabel: '', displayName: 'Sunita', greetingName: 'Mummy', language: 'hi' as const, timeZone: 'Asia/Kolkata',
    speakingSpeed: 'slower' as const, reminderTone: 'gentle' as const, sathiVoice: 'mom' as const, notificationsEnabled: true, archived: false, createdAt: now.toISOString() }
  it('a profile round-trips with its stable id, voice and archived flag', () => {
    expect(M.personFromRow({ ...M.personToRow(person, uid), created_at: now.toISOString() })).toEqual(person)
    expect(M.personFromRow({ ...M.personToRow({ ...person, archived: true }, uid), created_at: now.toISOString() }).archived).toBe(true)
  })
  it('every record row carries its person id both ways', () => {
    const m = { ...blankMedicine('Asia/Kolkata', now), name: 'Metformin', personId: 'per_mum1' }
    expect(M.medToRow(m, uid).person_id).toBe('per_mum1'); expect(M.medFromRow(M.medToRow(m, uid)).personId).toBe('per_mum1')
    const r = { ...createReminder({ ownerId: 'me', title: 'Walk', when: new Date(now.getTime() + 60000), timeZone: 'Asia/Kolkata' }, now), personId: 'per_mum1' }
    expect(M.reminderFromRow(M.reminderToRow(r, uid)).personId).toBe('per_mum1')
  })
})

describe('row mapping round-trips', () => {
  it('medicine', () => {
    const m = { ...blankMedicine('Asia/Kolkata', now), name: 'Metformin', strength: '500mg', dose: '1 tablet', frequency: 'twice' as const, times: ['08:00', '20:00'], food: 'after' as const, status: 'active' as const, color: 2 }
    const back = M.medFromRow(M.medToRow(m, uid))
    expect(back).toMatchObject({ id: m.id, name: 'Metformin', times: ['08:00', '20:00'], food: 'after', status: 'active', color: 2, timeZone: 'Asia/Kolkata' })
  })
  it('reminder keeps history and idempotency key', () => {
    const r = { ...createReminder({ ownerId: 'me', title: 'Walk', when: new Date(now.getTime() + 60000), timeZone: 'Asia/Kolkata' }, now), snoozeHistory: [{ at: now.toISOString(), from: 'a', to: 'b', minutes: 10 }] }
    const back = M.reminderFromRow(M.reminderToRow(r, uid))
    expect(back.snoozeHistory[0].minutes).toBe(10); expect(back.idempotencyKey).toBe(r.idempotencyKey); expect(back.status).toBe('scheduled')
  })
  it('client and server derive the same id for a series occurrence', () => {
    const s = { id: 'ser_x', ownerId: uid, kind: 'custom' as const, title: 'Walk', localTime: '20:00', timeZone: 'Asia/Kolkata', active: true, startAt: now.toISOString() }
    const [r] = materialize([s], [], now, 0)
    expect(r.id).toBe('rem_series:ser_x:2026-10-29')
    expect(r.idempotencyKey).toBe('series:ser_x:2026-10-29')
  })
  it('readings: sugar and bp', () => {
    const r = { id: 'r1', type: 'sugar' as const, at: now.toISOString(), value: 180, unit: 'mg/dL' as const, context: 'fasting' as const, source: 'manual' as const, createdAt: now.toISOString(), updatedAt: now.toISOString() }
    expect(M.readingFromRow({ ...M.readingToRow(r, uid), created_at: r.createdAt, updated_at: r.updatedAt })).toMatchObject({ value: 180, context: 'fasting' })
  })
  it('push endpoint ids are stable', () => { expect(newIdFor('https://x/1')).toBe(newIdFor('https://x/1')); expect(newIdFor('https://x/1')).not.toBe(newIdFor('https://x/2')) })
})
