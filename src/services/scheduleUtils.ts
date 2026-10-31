import type { Frequency, TimeOfDay } from '../types';

export const FREQ_OPTIONS: Frequency[] = ['Once daily', 'Twice daily', 'Three times daily', 'Custom'];

export const SUGGESTED_TOD: Record<TimeOfDay, string> = {
  Morning: '08:00',
  Afternoon: '14:00',
  Evening: '18:00',
  Night: '21:00',
};

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isoDateLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Normalize a time input to HH:MM. Accepts HH:MM, H:MM, HH:MM:SS. */
export function normalizeClock(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function normalizeFrequency(v: string | undefined): Frequency {
  if (v === 'Twice daily' || v === 'twice') return 'Twice daily';
  if (v === 'Three times daily' || v === 'Thrice' || v === 'thrice') return 'Three times daily';
  if (v === 'Custom' || v === 'custom') return 'Custom';
  return 'Once daily';
}

export function slotCount(frequency: Frequency, current = 1): number {
  if (frequency === 'Once daily') return 1;
  if (frequency === 'Twice daily') return 2;
  if (frequency === 'Three times daily') return 3;
  return Math.max(current, 1);
}

export function suggestedTimes(frequency: Frequency, tod: TimeOfDay = 'Morning'): string[] {
  const n = slotCount(frequency, 1);
  if (frequency === 'Twice daily') return [SUGGESTED_TOD[tod], '20:00'];
  if (frequency === 'Three times daily') return ['08:00', '14:00', '20:00'];
  if (frequency === 'Custom') return [SUGGESTED_TOD[tod]];
  return [SUGGESTED_TOD[tod]];
}

export function resizeTimes(frequency: Frequency, current: string[], tod: TimeOfDay = 'Morning'): string[] {
  const n = slotCount(frequency, current.length);
  const base = suggestedTimes(frequency, tod);
  return Array.from({ length: n }, (_, i) => normalizeClock(current[i] ?? '') ?? base[i] ?? '20:00');
}

export function validateTimes(times: string[]): { times: string[]; error: string | null } {
  const out: string[] = [];
  for (let i = 0; i < times.length; i++) {
    const n = normalizeClock(times[i] ?? '');
    if (!n) return { times, error: `Dose ${i + 1} needs an exact clock time.` };
    out.push(n);
  }
  if (!out.length) return { times, error: 'Add at least one dose time.' };
  const seen = new Set<string>();
  for (let i = 0; i < out.length; i++) {
    if (seen.has(out[i])) return { times: out, error: 'Two doses have the same time. Change one of them.' };
    seen.add(out[i]);
  }
  return { times: out, error: null };
}

export function dueAt(date: string, time: string, snoozedUntil?: string): Date {
  if (snoozedUntil) return new Date(snoozedUntil);
  const [h, m] = (normalizeClock(time) ?? '00:00').split(':').map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

export function localIsoFromDateTime(date: string, time: string): string {
  return dueAt(date, time).toISOString();
}

export function scheduleRowId(medicineId: string, time: string): string {
  const t = (normalizeClock(time) ?? time).replace(':', '');
  return `sch_${medicineId}_${t}`;
}

export function occurrenceId(medicineId: string, date: string, time: string): string {
  return `${medicineId}-${date}-${normalizeClock(time) ?? time}`;
}

const OVERDUE_AFTER_MIN = 120;

export type DoseFace = 'upcoming' | 'due' | 'overdue' | 'taken' | 'skipped' | 'snoozed' | 'missed';

export function doseFace(
  status: string,
  date: string,
  time: string,
  now = new Date(),
  snoozedUntil?: string,
): DoseFace {
  if (status === 'taken') return 'taken';
  if (status === 'skipped') return 'skipped';
  if (status === 'missed') return 'missed';
  const when = dueAt(date, time, status === 'snoozed' ? snoozedUntil : undefined);
  const lateMin = (now.getTime() - when.getTime()) / 60000;
  if (lateMin < 0) return status === 'snoozed' ? 'snoozed' : 'upcoming';
  if (lateMin >= OVERDUE_AFTER_MIN) return 'overdue';
  return status === 'snoozed' ? 'snoozed' : 'due';
}

export function shouldPersistMissed(face: DoseFace, status: string): boolean {
  return face === 'overdue' && status !== 'missed' && status !== 'taken' && status !== 'skipped';
}
