import type { AppState, Medicine, ProfileId, ReminderEvent } from '../types';
import { isoDate } from '../data/demoData';
import { doseFace, dueAt, normalizeClock, occurrenceId, shouldPersistMissed } from './scheduleUtils';
import { clearFired } from './notifyService';

import { fmtTime } from './timeFormat';

export { fmtTime, fmtTimeShort, to24 } from './timeFormat';
export { doseFace, dueAt } from './scheduleUtils';

const eventId = (m: Medicine, date: string, t: string) => occurrenceId(m.id, date, t);

/** Idempotent: one event per medicine / member / local date / clock time. */
export function regenerateEvents(s: AppState, now = new Date()): AppState {
  const today = isoDate(now);
  const wanted = new Map<string, { m: Medicine; t: string }>();
  for (const m of s.medicines) {
    if (m.status !== 'ready' || m.completed) continue;
    if (m.startedOn && m.startedOn > today) continue;
    if (m.endedOn && m.endedOn < today) continue;
    for (const raw of m.times) {
      const t = normalizeClock(raw) ?? raw;
      wanted.set(eventId(m, today, t), { m, t });
    }
  }
  const events = s.events.filter((e) => {
    if (e.kind === 'custom' || e.kind === 'appointment') return true;
    if (e.status === 'taken' || e.status === 'skipped') return true;
    if (e.date !== today) return e.status !== 'upcoming' && e.status !== 'snoozed';
    return wanted.has(e.id);
  });
  const have = new Set(events.map((e) => e.id));
  for (const [id, { m, t }] of wanted) {
    if (!have.has(id)) {
      events.push({
        id,
        profileId: m.profileId,
        medicineId: m.id,
        kind: 'medicine',
        date: today,
        time: t,
        status: 'upcoming',
        demo: m.demo,
      });
    }
  }
  const next = events.filter((e) => e.kind === 'custom' || e.kind === 'appointment' || s.medicines.some((m) => m.id === e.medicineId));
  if (next.length === s.events.length && next.every((e, i) => e === s.events[i] || (e.id === s.events[i]?.id && e.status === s.events[i]?.status && e.time === s.events[i]?.time && e.date === s.events[i]?.date))) {
    return s;
  }
  return { ...s, events: next };
}

export function sweepMissed(s: AppState, now = new Date()): AppState {
  let changed = false;
  const events = s.events.map((e) => {
    if (e.status === 'taken' || e.status === 'skipped' || e.status === 'missed') return e;
    const face = doseFace(e.status, e.date, e.time, now, e.snoozedUntil);
    if (shouldPersistMissed(face, e.status)) {
      changed = true;
      return { ...e, status: 'missed' as const };
    }
    return e;
  });
  return changed ? { ...s, events } : s;
}

export function tickReminders(s: AppState, now = new Date()): AppState {
  return sweepMissed(regenerateEvents(s, now), now);
}

const patchEvent = (s: AppState, id: string, patch: Partial<ReminderEvent>): AppState => ({
  ...s,
  events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
});

export const markTaken = (s: AppState, id: string): AppState =>
  patchEvent(s, id, { status: 'taken', actedAt: new Date().toISOString(), selfReported: true, snoozedUntil: undefined });
export const markSkipped = (s: AppState, id: string): AppState =>
  patchEvent(s, id, { status: 'skipped', actedAt: new Date().toISOString(), snoozedUntil: undefined });
export const snooze = (s: AppState, id: string, minutes = 10): AppState =>
  patchEvent(s, id, { status: 'snoozed', snoozedUntil: new Date(Date.now() + minutes * 60000).toISOString() });

export function undoDose(s: AppState, id: string): AppState {
  clearFired(id);
  return patchEvent(s, id, { status: 'upcoming', actedAt: undefined, snoozedUntil: undefined, selfReported: undefined });
}

export const eventsFor = (s: AppState, pid: ProfileId = s.activeProfileId, date = isoDate(new Date())) =>
  s.events
    .filter((e) => e.profileId === pid && e.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));

const effectiveTime = (e: ReminderEvent) => dueAt(e.date, e.time, e.status === 'snoozed' ? e.snoozedUntil : undefined).getTime();

export function dueEvents(s: AppState, now = new Date(), pid?: ProfileId): ReminderEvent[] {
  return s.events.filter((e) => {
    if (pid && e.profileId !== pid) return false;
    if (e.status === 'taken' || e.status === 'skipped') return false;
    const face = doseFace(e.status, e.date, e.time, now, e.snoozedUntil);
    return face === 'due' || face === 'overdue' || face === 'missed';
  }).sort((a, b) => effectiveTime(a) - effectiveTime(b));
}

export const nextReminder = (s: AppState, pid: ProfileId = s.activeProfileId, now = new Date()): ReminderEvent | undefined => {
  const due = dueEvents(s, now, pid)[0];
  if (due) return due;
  return eventsFor(s, pid)
    .filter((e) => e.status === 'upcoming' || e.status === 'snoozed')
    .sort((a, b) => effectiveTime(a) - effectiveTime(b))[0];
};

export const missedEvents = (s: AppState, pid: ProfileId = s.activeProfileId, now = new Date()) =>
  eventsFor(s, pid).filter((e) => {
    const face = doseFace(e.status, e.date, e.time, now, e.snoozedUntil);
    return face === 'missed' || face === 'overdue';
  });

export const historyFor = (s: AppState, pid: ProfileId = s.activeProfileId) =>
  s.events.filter((e) => e.profileId === pid).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

export const nextLabel = (s: AppState, m: Medicine, now = new Date()): string => {
  if (m.status === 'paused') return 'Paused';
  if (m.status !== 'ready') return 'Needs review';
  const e = eventsFor(s, m.profileId).filter((x) => x.medicineId === m.id && x.status !== 'taken' && x.status !== 'skipped')[0];
  if (e) {
    const face = doseFace(e.status, e.date, e.time, now, e.snoozedUntil);
    const clock = e.snoozedUntil ? new Date(e.snoozedUntil).toTimeString().slice(0, 5) : e.time;
    if (face === 'due') return `Due now · ${fmtTime(clock)}`;
    if (face === 'overdue' || face === 'missed') return `Overdue · ${fmtTime(clock)}`;
    if (face === 'snoozed') return `Snoozed · ${fmtTime(clock)}`;
    return `Next: Today, ${fmtTime(clock)}`;
  }
  return `Next: Tomorrow, ${fmtTime(m.times[0] ?? '08:00')}`;
};

export function newlyDueIds(s: AppState, now = new Date()): ReminderEvent[] {
  return s.events.filter((e) => {
    if (e.status === 'taken' || e.status === 'skipped' || e.status === 'missed') return false;
    const face = doseFace(e.status, e.date, e.time, now, e.snoozedUntil);
    return face === 'due' || face === 'overdue';
  });
}
