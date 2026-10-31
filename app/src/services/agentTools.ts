/**
 * The tools the live Sathi agent can call (ElevenLabs "client tools": run in this browser, in the signed-in user's session).
 * The model supplies ONLY the reminder details. Who is acting (the verified user) and who the reminder is for (the profile this session
 * was opened for) come from the app, and the server re-checks both. Every answer starts with SAVED or NOT SAVED, so the agent can only
 * say "done" after the backend confirmed it.
 */
import type { Outcome } from '../../../supabase/functions/_shared/reminder-tool.ts'

export interface ToolDeps {
  /** POST to the `reminders` Edge Function. Throws only when the server cannot be reached / there is no session. */
  call(body: Record<string, unknown>): Promise<{ http: number; body: any }>
  personId: string
  label: string
  language: string
  /** Re-load reminders from the server so the UI shows what was actually stored. */
  refresh(): Promise<void>
}

const NOT_REACHED = 'NOT SAVED. The server could not be reached, so nothing was changed. Tell the user the reminder was not saved and offer to try again.'

export function describeOutcome(o: Outcome | { status: string; [k: string]: any }, who: string): string {
  switch (o.status) {
    case 'saved': {
      const r = (o as any).reminder
      return `SAVED. "${r.title}" for ${who} on ${r.localDate} at ${r.localTime} (${r.timeZone})${r.recurrence === 'daily' ? ', every day' : ''}. You may now confirm this to the user.`
    }
    case 'duplicate': return `ALREADY SAVED. This reminder already exists, nothing new was created. You may tell the user it is already set.`
    case 'needs_clarification': return `NOT SAVED. Ask the user exactly one question: ${(o as any).question}`
    case 'permission_denied': return 'NOT SAVED. This account is not allowed to change that. Tell the user it could not be done; do not retry.'
    case 'invalid_request': return `NOT SAVED. ${(o as any).message} Ask the user to correct it.`
    default: return 'NOT SAVED. The server could not save the change. Tell the user it was not saved and offer to try again.'
  }
}

export function reminderTools(d: ToolDeps) {
  const run = async (body: Record<string, unknown>, ok: (o: any) => string = (o) => describeOutcome(o, d.label)): Promise<string> => {
    let res: { http: number; body: any }
    try { res = await d.call({ ...body, language: d.language }) } catch { return NOT_REACHED }
    const o = res.body
    if (!o || typeof o.status !== 'string') return res.http >= 500 || res.http === 0 ? NOT_REACHED : 'NOT SAVED. The server gave an unexpected answer. Tell the user it was not saved.'
    // refresh the UI only from what the server confirmed
    if (o.status === 'saved' || o.status === 'duplicate' || o.status === 'ok') await d.refresh().catch(() => undefined)
    return ok(o)
  }
  return {
    create_reminder: (p: { title?: string; description?: string; category?: string; date?: string; time?: string; part_of_day?: string; recurrence?: string; end_date?: string; medication_id?: string; call_id?: string }) =>
      run({ action: 'create', personId: d.personId, title: p.title, description: p.description, category: p.category, date: p.date, time: p.time, partOfDay: p.part_of_day, recurrence: p.recurrence, endsOn: p.end_date, medicationId: p.medication_id, idempotencyKey: p.call_id, source: 'agent' }),
    list_todays_reminders: () => run({ action: 'list_today', personId: d.personId }, (o) => o.status !== 'ok' ? describeOutcome(o, d.label)
      : o.reminders.length ? `${d.label} has ${o.reminders.length} reminder(s) today: ` + o.reminders.map((r: any) => `[id ${r.id}] ${r.title} at ${r.localTime} (${r.status})`).join('; ') : `${d.label} has no reminders today.`),
    snooze_reminder: (p: { reminder_id: string; minutes: number }) => run({ action: 'snooze', reminderId: p.reminder_id, minutes: p.minutes }),
    reschedule_reminder: (p: { reminder_id: string; date?: string; time?: string }) => run({ action: 'reschedule', reminderId: p.reminder_id, date: p.date, time: p.time }),
    skip_dose: (p: { reminder_id: string }) => run({ action: 'skip', reminderId: p.reminder_id }, (o) => o.status === 'saved' ? 'SAVED. The dose is recorded as skipped. Tell the user: do not take an extra dose later; check the prescription or ask the doctor or pharmacist if unsure.' : describeOutcome(o, d.label)),
    cancel_reminder: (p: { reminder_id: string }) => run({ action: 'cancel', reminderId: p.reminder_id }),
    complete_reminder: (p: { reminder_id: string }) => run({ action: 'complete', reminderId: p.reminder_id }),
  }
}
