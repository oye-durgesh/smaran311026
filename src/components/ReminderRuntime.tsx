import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import ReminderSheet from './ReminderSheet';
import { dueAt, newlyDueIds, tickReminders } from '../services/reminderService';
import { hasFired, markFired, showDoseNotification } from '../services/notifyService';
import { medicineLabel } from '../services/medicineService';
import { fmtTime } from '../services/timeFormat';
import { liveUserId } from '../services/dataService';
import { getActiveLive } from '../services/voiceService';
import {
  decideDueReminder,
  hasOpenedDueCall,
  markOpenedDueCall,
  peekDueCallHref,
  stashDueCallHref,
  takeDueCallHref,
  type MicPermission,
} from '../services/reminderCall';
import type { ReminderEvent } from '../types';

function fireIfNeeded(e: ReminderEvent, title: string, body: string, allowBrowser: boolean) {
  if (hasFired(e.id)) return false;
  markFired(e.id);
  if (allowBrowser) showDoseNotification(title, body, e.id);
  return true;
}

async function queryMicPermission(): Promise<MicPermission> {
  try {
    const perm = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    if (perm?.state === 'granted' || perm?.state === 'denied' || perm?.state === 'prompt') return perm.state;
  } catch { /* Permissions API optional */ }
  return 'unknown';
}

/** Foreground reminder clock. Runs on every screen while Smaran is open. */
export default function ReminderRuntime() {
  const { state, update } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [sheet, setSheet] = useState<ReminderEvent | null>(null);
  const stateRef = useRef(state);
  const locRef = useRef(loc);
  stateRef.current = state;
  locRef.current = loc;
  const launched = useRef(new Set<string>());

  useEffect(() => {
    const storage = typeof localStorage === 'undefined' ? null : localStorage;

    const openHref = (href: string, occurrenceId?: string) => {
      const path = locRef.current.pathname;
      if (path.startsWith('/call')) return false;
      if (getActiveLive()) return false;
      if (occurrenceId) {
        if (launched.current.has(occurrenceId) || hasOpenedDueCall(occurrenceId, storage)) return false;
        launched.current.add(occurrenceId);
        markOpenedDueCall(occurrenceId, storage);
      }
      takeDueCallHref(storage);
      nav(href);
      return true;
    };

    const consumeStash = () => {
      const href = peekDueCallHref(storage);
      if (!href || document.visibilityState !== 'visible') return;
      const oid = new URLSearchParams(href.split('?')[1] || '').get('oid') || undefined;
      openHref(href, oid);
    };

    const run = () => {
      const now = new Date();
      let next = stateRef.current;
      update((s) => {
        next = tickReminders(s, now);
        return next;
      });
      const due = newlyDueIds(next, now);
      void (async () => {
        const micPermission = await queryMicPermission();
        const userActivation = typeof navigator !== 'undefined' && !!navigator.userActivation?.isActive;
        for (const e of due) {
          const m = next.medicines.find((x) => x.id === e.medicineId);
          const who = next.profiles.find((p) => p.id === e.profileId)?.name ?? 'Family';
          const title = m ? medicineLabel(m) : (e.title || 'Reminder');
          const first = fireIfNeeded(e, `${title} · ${who}`, `Due at ${fmtTime(e.time)}`, next.settings.notificationsAllowed);
          if (!first) continue;
          const action = decideDueReminder(e, {
            activeProfileId: next.activeProfileId,
            pathname: locRef.current.pathname,
            callActive: !!getActiveLive(),
            alreadyOpened: launched.current.has(e.id) || hasOpenedDueCall(e.id, storage),
            micAllowed: next.settings.micAllowed,
            micPermission,
            userActivation,
            userId: liveUserId(),
          });
          if (action.type === 'sheet') {
            setSheet((open) => open ?? e);
            continue;
          }
          if (action.type !== 'call') continue;
          stashDueCallHref(action.href, storage);
          if (document.visibilityState === 'visible') openHref(action.href, e.id);
        }
        consumeStash();
      })();
    };

    run();
    const onVis = () => { if (document.visibilityState === 'visible') { consumeStash(); run(); } };
    const onDue = (ev: Event) => {
      const detail = (ev as CustomEvent<{ occurrenceId?: string }>).detail;
      const href = peekDueCallHref(storage);
      if (href) openHref(href, detail?.occurrenceId);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', run);
    window.addEventListener('smaran:due-call', onDue);

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
      window.removeEventListener('smaran:due-call', onDue);
      clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [nav, update]);

  const live = sheet ? (state.events.find((e) => e.id === sheet.id) ?? sheet) : null;
  if (!live || live.status === 'taken' || live.status === 'skipped') return null;
  return <ReminderSheet event={live} onClose={() => setSheet(null)} />;
}
