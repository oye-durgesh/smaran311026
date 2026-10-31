import type { AppState, Medicine, ProfileId, ReminderEvent } from '../types';
import { isoDate } from '../data/demoData';

const LATE_AFTER_MIN = 60;

export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
};
export const fmtTimeShort = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const to24 = (label: string): string | null => {
  const m = label.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const eventId = (m: Medicine, date: string, t: string) => `${m.id}-${date}-${t}`;

/** Idempotent: one event per medicine/date/time. Drops stale upcoming events for removed times. */
export function regenerateEvents(s: AppState, now = new Date()): AppState {
  const today = isoDate(now);
  const wanted = new Map<string, { m: Medicine; t: string }>();
  for (const m of s.medicines) {
    if (m.status !== 'ready' || m.completed) continue;
    for (const t of m.times) wanted.set(eventId(m, today, t), { m, t });
  }
  const events = s.events.filter((e) => e.kind === 'custom' || e.kind === 'appointment' || e.date !== today || wanted.has(e.id) || e.status === 'taken' || e.status === 'skipped');
  const have = new Set(events.map((e) => e.id));
  for (const [id, { m, t }] of wanted) {
    if (!have.has(id)) events.push({ id, profileId: m.profileId, medicineId: m.id, kind: 'medicine', date: today, time: t, status: 'upcoming' });
  }
  return { ...s, events: events.filter((e) => e.kind === 'custom' || e.kind === 'appointment' || s.medicines.some((m) => m.id === e.medicineId)) };
}

/** Mark overdue upcoming events as missed (called on app load / tick). */
export function sweepMissed(s: AppState, now = new Date()): AppState {
  let changed = false;
  const events = s.events.map((e) => {
    if (e.status !== 'upcoming' && e.status !== 'snoozed') return e;
    if (e.demo && e.status === 'upcoming') return e; // seeded sample reminder stays actionable
    const [h, m] = e.time.split(':').map(Number);
    const due = new Date(e.date + 'T00:00:00');
    due.setHours(h, m, 0, 0);
    const until = e.snoozedUntil ? new Date(e.snoozedUntil).getTime() : due.getTime();
    if (now.getTime() - until > LATE_AFTER_MIN * 60000) {
      changed = true;
      return { ...e, status: 'missed' as const };
    }
    return e;
  });
  return changed ? { ...s, events } : s;
}

const patchEvent = (s: AppState, id: string, patch: Partial<ReminderEvent>): AppState => ({
  ...s,
  events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
});

/** Self-reported: the app never claims to verify ingestion. */
export const markTaken = (s: AppState, id: string): AppState =>
  patchEvent(s, id, { status: 'taken', actedAt: new Date().toISOString(), selfReported: true, snoozedUntil: undefined });
export const markSkipped = (s: AppState, id: string): AppState =>
  patchEvent(s, id, { status: 'skipped', actedAt: new Date().toISOString(), snoozedUntil: undefined });
export const snooze = (s: AppState, id: string, minutes = 10): AppState =>
  patchEvent(s, id, { status: 'snoozed', snoozedUntil: new Date(Date.now() + minutes * 60000).toISOString() });

export const eventsFor = (s: AppState, pid: ProfileId = s.activeProfileId, date = isoDate(new Date())) =>
  s.events
    .filter((e) => e.profileId === pid && e.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));

const effectiveTime = (e: ReminderEvent) => (e.snoozedUntil ? new Date(e.snoozedUntil).getTime() : new Date(`${e.date}T${e.time}:00`).getTime());

export const nextReminder = (s: AppState, pid: ProfileId = s.activeProfileId): ReminderEvent | undefined =>
  eventsFor(s, pid)
    .filter((e) => e.status === 'upcoming' || e.status === 'snoozed')
    .sort((a, b) => effectiveTime(a) - effectiveTime(b))[0];

export const missedEvents = (s: AppState, pid: ProfileId = s.activeProfileId) =>
  eventsFor(s, pid).filter((e) => e.status === 'missed');

export const historyFor = (s: AppState, pid: ProfileId = s.activeProfileId) =>
  s.events.filter((e) => e.profileId === pid).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

export const nextLabel = (s: AppState, m: Medicine): string => {
  if (m.status === 'paused') return 'Paused';
  if (m.status !== 'ready') return 'Needs review';
  const e = eventsFor(s, m.profileId).filter((x) => x.medicineId === m.id && (x.status === 'upcoming' || x.status === 'snoozed')).sort((a, b) => a.time.localeCompare(b.time))[0];
  if (e) return `Next: Today, ${fmtTime(e.snoozedUntil ? new Date(e.snoozedUntil).toTimeString().slice(0, 5) : e.time)}`;
  return `Next: Tomorrow, ${fmtTime(m.times[0])}`;
};
