import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import ReminderSheet from './ReminderSheet';
import { dueAt, newlyDueIds, tickReminders } from '../services/reminderService';
import { hasFired, markFired, showDoseNotification } from '../services/notifyService';
import { medicineLabel } from '../services/medicineService';
import { fmtTime } from '../services/timeFormat';
import type { ReminderEvent } from '../types';

function fireIfNeeded(e: ReminderEvent, title: string, body: string, allowBrowser: boolean) {
  if (hasFired(e.id)) return false;
  markFired(e.id);
  if (allowBrowser) showDoseNotification(title, body, e.id);
  return true;
}

/** Foreground reminder clock. Runs on every screen while Smaran is open. */
export default function ReminderRuntime() {
  const { state, update } = useStore();
  const [sheet, setSheet] = useState<ReminderEvent | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const run = () => {
      const now = new Date();
      let next = stateRef.current;
      update((s) => {
        next = tickReminders(s, now);
        return next;
      });
      const due = newlyDueIds(next, now);
      for (const e of due) {
        const m = next.medicines.find((x) => x.id === e.medicineId);
        const who = next.profiles.find((p) => p.id === e.profileId)?.name ?? 'Family';
        const title = m ? medicineLabel(m) : (e.title || 'Reminder');
        const first = fireIfNeeded(e, `${title} · ${who}`, `Due at ${fmtTime(e.time)}`, next.settings.notificationsAllowed);
        if (first) setSheet((open) => open ?? e);
      }
    };

    run();
    const onVis = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', run);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const now = Date.now();
      let soon = 15_000;
      for (const e of stateRef.current.events) {
        if (e.status === 'taken' || e.status === 'skipped') continue;
        const t = dueAt(e.date, e.time, e.status === 'snoozed' ? e.snoozedUntil : undefined).getTime() - now;
        if (t > 0 && t < soon) soon = Math.max(250, t + 80);
      }
      timeout = setTimeout(() => { run(); arm(); }, soon);
    };
    arm();
    const interval = setInterval(run, 15_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', run);
      clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [update]);

  const live = sheet ? (state.events.find((e) => e.id === sheet.id) ?? sheet) : null;
  if (!live || live.status === 'taken' || live.status === 'skipped') return null;
  return <ReminderSheet event={live} onClose={() => setSheet(null)} />;
}
