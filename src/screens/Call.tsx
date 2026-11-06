import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import Gen from './Gen';
import { C, Dialog, PillBtn, useToast } from '../components/ui';
import { fmtTime, markTaken, nextReminder, snooze } from '../services/reminderService';
import { medicineLabel } from '../services/medicineService';
import { endActiveLive, getActiveLive, voiceService, type VoiceLine } from '../services/voiceService';
import { isVoiceRole } from '../services/identity';
import type { AppState, ProfileId, ReminderEvent } from '../types';

const CANNED_AGENT = '"Achha, main note kar leti hoon ki aapne dawa lene ki pushti ki hai. Aapka agla reminder raat 10 baje hai."';

function useCallEvent(): { event?: ReminderEvent; label: string; name: string; qs: string; profileId: ProfileId } {
  const [q] = useSearchParams();
  const { state } = useStore();
  const id = q.get('e');
  const event = (id && state.events.find((e) => e.id === id)) || nextReminder(state, state.activeProfileId) || state.events.find((e) => e.profileId === state.activeProfileId);
  const m = event && state.medicines.find((x) => x.id === event.medicineId);
  const fromEvent = event?.profileId ?? state.activeProfileId;
  const profileId: ProfileId = isVoiceRole(state.activeProfileId) ? state.activeProfileId : fromEvent;
  return { event, label: m ? medicineLabel(m) : 'your medicine', name: m?.name ?? 'your medicine', qs: event ? `?e=${event.id}` : '', profileId };
}

const recordCall = (s: AppState, e: ReminderEvent | undefined): AppState => {
  if (!e) return s;
  const m = s.medicines.find((x) => x.id === e.medicineId);
  const done = markTaken(s, e.id);
  return {
    ...done,
    voiceHistory: [...done.voiceHistory, { id: `vc-${Date.now()}`, profileId: e.profileId, at: new Date().toISOString(), kind: 'reminder-call', summary: `Reported taking ${m?.name ?? 'medicine'} (self-reported)` }],
  };
};

function LiveOverlay({ lines, error, onRetry }: { lines: VoiceLine[]; error: string; onRetry?: () => void }) {
  if (!error && lines.length === 0) return null;
  return (
    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 88, zIndex: 8, pointerEvents: error ? 'auto' : 'none' }}>
      {error && (
        <div role="alert" style={{ background: 'rgba(46,36,27,.92)', color: '#F5EFE6', borderRadius: 14, padding: 14, marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.err }}>Could not connect</div>
          <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>{error}</div>
          {onRetry && <div style={{ marginTop: 12, pointerEvents: 'auto' }}><PillBtn tone="sage" onClick={onRetry}>Retry</PillBtn></div>}
        </div>
      )}
      {!error && (lines.length > 0) && (
        <div style={{ background: 'rgba(46,36,27,.78)', color: '#F5EFE6', borderRadius: 14, padding: '10px 12px', maxHeight: 120, overflow: 'auto' }}>
          {lines.slice(-4).map((l, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.4, marginTop: i ? 6 : 0 }}>
              <span style={{ color: l.role === 'agent' ? '#C4B0C2' : '#B5C4A0' }}>{l.role === 'agent' ? 'Sathi' : 'You'}</span>
              {' — '}{l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Call() {
  const { stage = 'incoming' } = useParams();
  const nav = useNavigate();
  const [q] = useSearchParams();
  const { state, update } = useStore();
  const { event, name, qs, profileId } = useCallEvent();
  const [muted, setMuted] = useState(false);
  const [textDlg, setTextDlg] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const liveVoice = isVoiceRole(profileId);
  const toast = useToast();
  const go = (s: string) => nav(`/call/${s}${qs}`, { replace: s !== 'incoming' });
  const offline = !state.settings.deviceOnline;

  useEffect(() => () => { void endActiveLive(); }, []);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    const steps: Record<string, [string, number] | undefined> = {
      connecting: [offline ? 'reconnecting' : 'listening', 1600],
      listening: ['speaking', 2600],
      speaking: ['active', 3600],
      active: ['done', 3200],
    };

    const runDemo = (from: string) => {
      if (liveVoice) return;
      const st = steps[from];
      if (!st) return;
      const t = setTimeout(() => {
        if (st[0] === 'done') update((s) => recordCall(s, event));
        go(st[0]);
      }, st[1]);
      stop = () => clearTimeout(t);
    };

    if (liveVoice) {
      if (stage === 'connecting' && !offline) {
        if (getActiveLive()) return () => { cancelled = true; };
        const ac = new AbortController();
        setError('');
        setLines([]);
        void voiceService.tryLiveCall({
          profileId,
          occurrenceId: event?.kind === 'medicine' ? event.id : undefined,
          signal: ac.signal,
          onMode: (m) => { if (!cancelled) go(m === 'speaking' ? 'speaking' : 'listening'); },
          onDisconnect: () => { if (!cancelled) go('reconnecting'); },
          onTranscript: (line) => { if (!cancelled) setLines((prev) => [...prev.slice(-20), line]); },
          onError: (message) => {
            if (cancelled || message === 'Call cancelled.') return;
            setError(message);
            go('reconnecting');
          },
        }).then((live) => {
          if (cancelled && !getActiveLive()) { void live?.end(); return; }
          if (!live && !cancelled) go('reconnecting');
        });
        stop = () => { if (!getActiveLive()) ac.abort(); };
      }
    } else if (stage === 'connecting' && !offline) {
      void voiceService.tryLiveCall({
        profileId,
        occurrenceId: event?.kind === 'medicine' ? event.id : undefined,
        onMode: (m) => { if (!cancelled) go(m === 'speaking' ? 'speaking' : 'listening'); },
        onDisconnect: () => { if (!cancelled) go('done'); },
        onError: (message) => { if (!cancelled) { toast.show(message); go('done'); } },
      }).then((live) => {
        if (cancelled) { void live?.end(); return; }
        if (!live) runDemo('connecting');
        else stop = () => { void live.end(); };
      });
    } else {
      runDemo(stage);
    }

    return () => { cancelled = true; stop?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, offline, event?.id, profileId]);

  const end = () => { void endActiveLive(); nav(`/call/done${qs}${qs ? '&' : '?'}ended=1`, { replace: true }); };
  const mute = () => {
    setMuted((m) => {
      const next = !m;
      getActiveLive()?.setMuted(next);
      toast.show(next ? 'Microphone muted' : 'Microphone on');
      return next;
    });
  };
  const lastAgent = [...lines].reverse().find((l) => l.role === 'agent')?.text;
  const lastUser = [...lines].reverse().find((l) => l.role === 'user')?.text;
  const liveBubble = lastAgent
    || (lastUser ? `You: ${lastUser}` : '')
    || (stage === 'speaking' ? 'Speaking…' : stage === 'listening' ? 'Listening…' : 'Connecting…');
  const muteRep = {
    Mute: muted ? 'Unmute' : 'Mute',
    ...(liveVoice ? { [CANNED_AGENT]: liveBubble } : {}),
  };
  const retry = () => { setError(''); go('connecting'); };

  switch (stage) {
    case 'incoming':
      return (
        <Gen id="17" replace={{ 'Time for Metformin': `Time for ${name}` }} actions={{
          Answer: () => go('connecting'),
          'Not now': () => nav('/home'),
          'Remind me in 15 minutes': () => { if (event) update((s) => snooze(s, event.id, 15)); nav('/home'); },
        }} />
      );
    case 'connecting':
      return <><Gen id="34" actions={{}} /><LiveOverlay lines={lines} error={error} /></>;
    case 'listening':
      return <><Gen id="35" replace={muteRep} actions={{ Mute: mute, End: end, Unmute: mute }} /><LiveOverlay lines={lines} error={error} />{toast.node}</>;
    case 'speaking':
      return <><Gen id="36" replace={muteRep} actions={{ Mute: mute, Unmute: mute, Repeat: () => { if (!liveVoice) { go('speaking'); toast.show('Sathi will say that again'); } }, End: end }} /><LiveOverlay lines={lines} error={error} />{toast.node}</>;
    case 'active':
      return <><Gen id="18" replace={muteRep} actions={{ Mute: mute, Unmute: mute, Repeat: () => { if (!liveVoice) go('speaking'); }, End: end }} /><LiveOverlay lines={lines} error={error} />{toast.node}</>;
    case 'reconnecting':
      return (
        <>
          <Gen id="37" actions={{ 'Try again': () => { update((s) => ({ ...s, settings: { ...s.settings, deviceOnline: true } })); retry(); }, 'Respond by text': () => setTextDlg(true) }} />
          <LiveOverlay lines={[]} error={error || (liveVoice ? 'The live call did not connect.' : '')} onRetry={liveVoice ? retry : undefined} />
          {textDlg && (
            <Dialog title={`Did you take ${name}?`} body="Your answer is saved as self-reported. Smaran can't check it independently." confirm="I took it" cancel="Not yet" onCancel={() => { setTextDlg(false); nav('/home'); }} onConfirm={() => { update((s) => recordCall(s, event)); nav(`/call/done${qs}`, { replace: true }); }} />
          )}
        </>
      );
    default: {
      const ended = q.get('ended') === '1';
      const m = event && state.medicines.find((x) => x.id === event.medicineId);
      const taken = event?.status === 'taken' && !ended;
      const next = event ? nextReminder(state, event.profileId) : undefined;
      const nextT = next ? fmtTime(next.time) : 'tomorrow morning';
      return (
        <Gen id="19"
          replace={{
            'You reported taking your Metformin. Your next reminder is at 10:00 PM tonight.': taken ? `You reported taking your ${m?.name}. Your next reminder is ${next ? `at ${nextT} today` : nextT}.` : 'The call ended before we recorded an answer. Nothing was marked as taken.',
            'Metformin 500mg': m ? medicineLabel(m) : '—',
            'Reported taken': taken ? 'Reported taken (self-reported)' : 'No answer recorded',
            '8:04 AM': event?.actedAt && taken ? new Date(event.actedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—',
            '10:00 PM': nextT,
          }}
          actions={{ Done: () => nav('/home', { replace: true }), 'View medicines': () => nav('/medicines', { replace: true }) }} />
      );
    }
  }
}
