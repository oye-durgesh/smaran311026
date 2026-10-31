import type { DeliveryAttempt, Reminder, ReminderKind, ReminderSeries, ReminderStatus } from './types'
import { localDateKey, localTimeToUtc, tzParts } from './time'
import { newId } from './ids'

/** Minutes after the due time at which an unanswered reminder becomes "missed". */
export const MISSED_AFTER_MIN = 60
/** Minutes the incoming-call UI keeps ringing before it stops (reminder stays due). */
export const RING_TIMEOUT_SEC = 90
export const SNOOZE_OPTIONS = [5, 10, 15] as const

export class TransitionError extends Error {}

const ALLOWED: Record<ReminderStatus, ReminderStatus[]> = {
  scheduled: ['ringing', 'cancelled', 'scheduled', 'snoozed', 'completed', 'skipped'],
  ringing: ['completed', 'snoozed', 'declined', 'missed', 'cancelled', 'scheduled', 'skipped'],
  snoozed: ['ringing', 'completed', 'cancelled', 'scheduled', 'snoozed', 'missed', 'skipped'],
  declined: ['completed', 'snoozed', 'scheduled', 'missed', 'cancelled', 'skipped'],
  missed: ['completed', 'scheduled', 'skipped'],
  completed: [],
  cancelled: [],
  skipped: [],
}
export const canTransition = (from: ReminderStatus, to: ReminderStatus) => ALLOWED[from].includes(to)

function move(r: Reminder, to: ReminderStatus, nowIso: string, patch: Partial<Reminder> = {}): Reminder {
  if (!canTransition(r.status, to)) throw new TransitionError(`Cannot move a ${r.status} reminder to ${to}`)
  return { ...r, ...patch, status: to, updatedAt: nowIso }
}

export const isActive = (r: Reminder) => r.status === 'scheduled' || r.status === 'snoozed' || r.status === 'ringing' || r.status === 'declined'
export const isOpen = (r: Reminder) => isActive(r) || r.status === 'missed'

export interface NewReminderInput {
  ownerId: string
  kind?: ReminderKind
  title: string
  notes?: string
  when: Date
  timeZone: string
  medicineId?: string
  appointmentId?: string
  seriesId?: string
  recurrence?: Reminder['recurrence']
  idempotencyKey?: string
  id?: string
}

export function createReminder(i: NewReminderInput, now: Date): Reminder {
  const iso = i.when.toISOString()
  const nowIso = now.toISOString()
  return {
    id: i.id ?? newId('rem'),
    ownerId: i.ownerId,
    kind: i.kind ?? 'custom',
    title: i.title.trim(),
    notes: i.notes?.trim() || undefined,
    medicineId: i.medicineId,
    appointmentId: i.appointmentId,
    seriesId: i.seriesId,
    scheduledFor: iso,
    originalScheduledFor: iso,
    timeZone: i.timeZone,
    recurrence: i.recurrence ?? null,
    status: 'scheduled',
    createdAt: nowIso,
    updatedAt: nowIso,
    snoozeHistory: [],
    rescheduleHistory: [],
    deliveryAttempts: [],
    idempotencyKey: i.idempotencyKey ?? `custom:${i.title.trim().toLowerCase()}:${iso}`,
  }
}

/** Adds `incoming` unless a reminder with the same idempotency key already exists. */
export function addIdempotent(list: Reminder[], incoming: Reminder[]): { list: Reminder[]; added: Reminder[]; duplicates: Reminder[] } {
  const keys = new Set(list.map((r) => r.idempotencyKey))
  const added: Reminder[] = []
  const duplicates: Reminder[] = []
  for (const r of incoming) {
    if (keys.has(r.idempotencyKey)) { duplicates.push(r); continue }
    keys.add(r.idempotencyKey)
    added.push(r)
  }
  return { list: [...list, ...added], added, duplicates }
}

/** Roll recurring series forward: create today's and the next `horizonDays` days' occurrences once each. */
export function materialize(
  series: ReminderSeries[], reminders: Reminder[], now: Date, horizonDays = 2,
): Reminder[] {
  const out: Reminder[] = []
  const keys = new Set(reminders.map((r) => r.idempotencyKey))
  for (const s of series) {
    if (!s.active) continue
    const start = new Date(s.startAt)
    for (let off = 0; off <= horizonDays; off++) {
      const due = localTimeToUtc(now, off, s.localTime, s.timeZone)
      if (due.getTime() < start.getTime()) continue // never back-fill before the series existed
      const dayKey = localDateKey(due, s.timeZone)
      if (s.endsOn && dayKey > s.endsOn) continue
      const key = `series:${s.id}:${dayKey}`
      if (keys.has(key)) continue
      keys.add(key)
      const r = createReminder({
        ownerId: s.ownerId, kind: s.kind, title: s.title, notes: s.notes, when: due, timeZone: s.timeZone,
        medicineId: s.medicineId, seriesId: s.id, recurrence: { freq: 'daily', localTime: s.localTime }, idempotencyKey: key, id: `rem_${key}`, // same id the server derives
      }, now)
      out.push(r)
    }
  }
  return out
}

function attempt(r: Reminder, a: DeliveryAttempt): Reminder {
  return { ...r, deliveryAttempts: [...r.deliveryAttempts, a] }
}

/** scheduled/snoozed reminders whose time has come → ringing. Records one delivery attempt per due time. */
export function fireDue(reminders: Reminder[], now: Date): { reminders: Reminder[]; fired: Reminder[] } {
  const nowIso = now.toISOString()
  const fired: Reminder[] = []
  const next = reminders.map((r) => {
    if ((r.status === 'scheduled' || r.status === 'snoozed') && new Date(r.scheduledFor).getTime() <= now.getTime()) {
      const tooOld = now.getTime() - new Date(r.scheduledFor).getTime() > MISSED_AFTER_MIN * 60000
      if (tooOld) {
        return attempt(move(r, 'ringing', nowIso), { at: nowIso, channel: 'local', outcome: 'expired', note: 'due time passed while app was closed' })
      }
      const f = attempt(move(r, 'ringing', nowIso), { at: nowIso, channel: 'local', outcome: 'delivered', note: `due ${r.scheduledFor}` })
      fired.push(f)
      return f
    }
    return r
  })
  return { reminders: next, fired }
}

/** ringing/declined past the grace window → missed. */
export function expireStale(reminders: Reminder[], now: Date): Reminder[] {
  const nowIso = now.toISOString()
  return reminders.map((r) => {
    if ((r.status === 'ringing' || r.status === 'declined') &&
        now.getTime() - new Date(r.scheduledFor).getTime() > MISSED_AFTER_MIN * 60000) {
      return move(r, 'missed', nowIso)
    }
    return r
  })
}

export function complete(r: Reminder, via: 'voice' | 'tap' | 'manual', now: Date): Reminder {
  const iso = now.toISOString()
  return move(r, 'completed', iso, { completedAt: iso, completion: { via, basis: 'user-reported' } })
}

export function cancel(r: Reminder, now: Date): Reminder {
  const iso = now.toISOString()
  return move(r, 'cancelled', iso, { cancelledAt: iso })
}

export function skip(r: Reminder, now: Date): Reminder {
  const iso = now.toISOString()
  return move(r, 'skipped', iso, { skippedAt: iso })
}

export function decline(r: Reminder, now: Date): Reminder {
  const iso = now.toISOString()
  return attempt(move(r, 'declined', iso), { at: iso, channel: 'incall-ui', outcome: 'declined' })
}

export function markAnswered(r: Reminder, now: Date): Reminder {
  return attempt({ ...r, updatedAt: now.toISOString() }, { at: now.toISOString(), channel: 'incall-ui', outcome: 'answered' })
}

/** Snoozing updates THIS occurrence in place; it never creates another reminder. */
export function snooze(r: Reminder, minutes: number, now: Date): Reminder {
  if (!SNOOZE_OPTIONS.includes(minutes as 5 | 10 | 15)) throw new TransitionError('Snooze must be 5, 10 or 15 minutes')
  const to = new Date(now.getTime() + minutes * 60000).toISOString()
  return move(r, 'snoozed', now.toISOString(), {
    scheduledFor: to,
    snoozeHistory: [...r.snoozeHistory, { at: now.toISOString(), from: r.scheduledFor, to, minutes }],
  })
}

export function reschedule(r: Reminder, when: Date, now: Date, reason = 'user'): Reminder {
  if (when.getTime() <= now.getTime()) throw new TransitionError('Pick a time in the future')
  const to = when.toISOString()
  return move(r, 'scheduled', now.toISOString(), {
    scheduledFor: to,
    rescheduleHistory: [...r.rescheduleHistory, { at: now.toISOString(), from: r.scheduledFor, to, reason }],
  })
}

export function editReminder(r: Reminder, patch: { title?: string; notes?: string }, now: Date): Reminder {
  if (!isOpen(r)) throw new TransitionError(`A ${r.status} reminder cannot be edited`)
  return { ...r, title: patch.title?.trim() || r.title, notes: patch.notes ?? r.notes, updatedAt: now.toISOString() }
}

export function upcoming(reminders: Reminder[]): Reminder[] {
  return reminders.filter(isActive).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
}
export function history(reminders: Reminder[]): Reminder[] {
  return reminders.filter((r) => r.status === 'completed' || r.status === 'cancelled' || r.status === 'missed')
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))
}
export function isToday(r: Reminder, now: Date, tz: string): boolean {
  return localDateKey(new Date(r.scheduledFor), tz) === localDateKey(now, tz)
}
export function dueNow(reminders: Reminder[]): Reminder[] {
  return reminders.filter((r) => r.status === 'ringing').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
}
export { tzParts }
