/** MOCK: the `reminders` Edge Function is replaced by a fake `call`. Proves what the agent is told, and that the UI refreshes only after a confirmed save. */
import { describe, expect, it, vi } from 'vitest'
import { reminderTools } from '../agentTools'

const make = (answer: { http: number; body: any } | Error) => {
  const call = vi.fn(async (_b: Record<string, unknown>) => { if (answer instanceof Error) throw answer; return answer })
  const refresh = vi.fn(async () => undefined)
  const tools = reminderTools({ call, personId: 'per_mum', label: 'Mummy', language: 'hi', refresh })
  return { tools, call, refresh }
}
const saved = { http: 200, body: { status: 'saved', reminder: { id: 'r1', title: 'Go for a walk', localDate: '2026-10-29', localTime: '18:00', timeZone: 'Asia/Kolkata', recurrence: 'none' } } }

describe('agent reminder tools (mock backend)', () => {
  it('a confirmed save tells the agent it may confirm, and refreshes the UI from the server', async () => {
    const { tools, refresh } = make(saved)
    const out = await tools.create_reminder({ title: 'Go for a walk', time: '18:00' })
    expect(out).toMatch(/^SAVED\. "Go for a walk" for Mummy on 2026-10-29 at 18:00/); expect(refresh).toHaveBeenCalledTimes(1)
  })
  it('the profile comes from the session, never from the model; the model cannot add an owner or another person', async () => {
    const { tools, call } = make(saved)
    await tools.create_reminder({ title: 'Walk', time: '18:00', ...({ personId: 'per_papa', owner_id: 'x', userId: 'y' } as object) })
    const sent = call.mock.calls[0][0]
    expect(sent).toMatchObject({ action: 'create', personId: 'per_mum', language: 'hi', source: 'agent' })
    expect(JSON.stringify(sent)).not.toMatch(/per_papa|owner_id|userId/)
  })
  it('server unreachable → NOT SAVED, no refresh, no success wording', async () => {
    const { tools, refresh } = make(new Error('Failed to fetch'))
    const out = await tools.create_reminder({ title: 'Walk', time: '18:00' })
    expect(out).toMatch(/^NOT SAVED/); expect(out).not.toMatch(/^SAVED/); expect(refresh).not.toHaveBeenCalled()
  })
  it('database failure (503) → NOT SAVED', async () => {
    const { tools, refresh } = make({ http: 503, body: { status: 'temporary_failure', message: 'x' } })
    expect(await tools.create_reminder({ title: 'Walk', time: '18:00' })).toMatch(/^NOT SAVED.*not saved/s); expect(refresh).not.toHaveBeenCalled()
  })
  it('unexpected / empty answer is never treated as success', async () => {
    expect(await make({ http: 502, body: null }).tools.create_reminder({ title: 'Walk', time: '18:00' })).toMatch(/^NOT SAVED/)
    expect(await make({ http: 200, body: { ok: true } }).tools.create_reminder({ title: 'Walk', time: '18:00' })).toMatch(/^NOT SAVED/)
  })
  it('needs_clarification hands the agent ONE question to ask and saves nothing', async () => {
    const { tools, refresh } = make({ http: 200, body: { status: 'needs_clarification', missing: 'time', question: 'Kitne baje yaad dilaun?' } })
    expect(await tools.create_reminder({ title: 'Walk' })).toBe('NOT SAVED. Ask the user exactly one question: Kitne baje yaad dilaun?'); expect(refresh).not.toHaveBeenCalled()
  })
  it('permission denied and invalid requests are NOT SAVED', async () => {
    expect(await make({ http: 403, body: { status: 'permission_denied', message: 'x' } }).tools.create_reminder({ title: 'Walk', time: '18:00' })).toMatch(/^NOT SAVED.*not allowed/s)
    expect(await make({ http: 400, body: { status: 'invalid_request', message: 'That time is in the past.' } }).tools.create_reminder({ title: 'Walk', time: '09:00' })).toMatch(/^NOT SAVED\. That time is in the past\./)
  })
  it('a retried call is reported as ALREADY SAVED, not as a second reminder', async () => {
    expect(await make({ http: 200, body: { status: 'duplicate', reminder: { id: 'r1' } } }).tools.create_reminder({ title: 'Walk', time: '18:00', call_id: 'c1' })).toMatch(/^ALREADY SAVED/)
  })
  it('daily reminders say so; the call id is forwarded as the idempotency key', async () => {
    const { tools, call } = make({ http: 200, body: { status: 'saved', reminder: { ...saved.body.reminder, recurrence: 'daily' } } })
    expect(await tools.create_reminder({ title: 'Go for a walk', time: '18:00', recurrence: 'daily', call_id: 'call-9' })).toMatch(/every day/)
    expect(call.mock.calls[0][0]).toMatchObject({ recurrence: 'daily', idempotencyKey: 'call-9' })
  })
  it('list/snooze/cancel/complete go through the server and report its answer', async () => {
    const list = make({ http: 200, body: { status: 'ok', reminders: [{ id: 'r1', title: 'Walk', localTime: '18:00', status: 'scheduled' }] } })
    expect(await list.tools.list_todays_reminders()).toMatch(/Mummy has 1 reminder\(s\) today: \[id r1\] Walk at 18:00 \(scheduled\)/)
    expect(await make({ http: 200, body: { status: 'ok', reminders: [] } }).tools.list_todays_reminders()).toBe('Mummy has no reminders today.')
    const s = make(saved); await s.tools.snooze_reminder({ reminder_id: 'r1', minutes: 10 }); expect(s.call.mock.calls[0][0]).toMatchObject({ action: 'snooze', reminderId: 'r1', minutes: 10 })
    expect(await make({ http: 403, body: { status: 'permission_denied', message: '' } }).tools.cancel_reminder({ reminder_id: 'r9' })).toMatch(/^NOT SAVED/)
    expect(await make(saved).tools.complete_reminder({ reminder_id: 'r1' })).toMatch(/^SAVED/)
  })
})
