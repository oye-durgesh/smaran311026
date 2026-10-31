import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ReminderEvent } from '../types';
import { C, DemoTag, MedIcon, PillBtn, TextLink } from './ui';
import { fmtTime, markSkipped, markTaken, snooze } from '../services/reminderService';
import { medicineLabel } from '../services/medicineService';

/** Bottom sheet for acting on a single reminder event. Taken is self-reported, never "verified". */
export default function ReminderSheet({ event, onClose, onEdit, onDelete }: { event: ReminderEvent; onClose: () => void; onEdit?: (e: ReminderEvent) => void; onDelete?: (e: ReminderEvent) => void }) {
  const nav = useNavigate();
  const { state, update } = useStore();
  const m = state.medicines.find((x) => x.id === event.medicineId);
  const custom = event.kind === 'custom' || event.kind === 'appointment' || !m;
  const done = event.status === 'taken' || event.status === 'skipped';
  const act = (fn: (s: typeof state, id: string) => typeof state) => () => { update((s) => fn(s, event.id)); onClose(); };
  const title = custom ? (event.title || 'Reminder') : medicineLabel(m!);
  return (
    <div role="dialog" aria-modal="true" aria-label="Reminder actions" style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.35)', zIndex: 30 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.paper, borderRadius: '24px 24px 0 0', padding: '12px 24px 32px', boxSizing: 'border-box' }}>
        <div style={{ width: 36, height: 4, background: C.line, borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {m && <MedIcon g={m.gradient} size={52} />}
          <div>
            <div className="sf" style={{ fontSize: 20 }}>{title}</div>
            <div style={{ fontSize: 13, color: C.muted }}>
              {fmtTime(event.time)} · {custom ? (event.notes || 'Custom reminder') : m!.food === 'No instruction' ? 'No food instruction' : m!.food} {(m?.demo || event.demo) && <DemoTag label="DEMO" />}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>
          Status: <b style={{ color: C.ink, textTransform: 'capitalize' }}>{event.status === 'taken' && custom ? 'completed' : event.status}</b>
          {event.status === 'snoozed' && event.snoozedUntil && ` until ${new Date(event.snoozedUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}
          {event.status === 'taken' && !custom && ' (self-reported)'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {!done && <PillBtn tone="sage" onClick={act(markTaken)}>{custom ? 'Mark completed' : 'I took it'}</PillBtn>}
          {!done && <PillBtn tone="light" onClick={act((s, id) => snooze(s, id, 10))}>Snooze for 10 minutes</PillBtn>}
          {!done && !custom && <PillBtn tone="light" onClick={act(markSkipped)}>Skip this dose</PillBtn>}
          {event.status === 'missed' && <PillBtn tone="sage" onClick={act(markTaken)}>{custom ? 'Mark completed' : 'Mark taken'}</PillBtn>}
          {done && <PillBtn tone="light" onClick={act((s, id) => ({ ...s, events: s.events.map((e) => (e.id === id ? { ...e, status: 'upcoming' as const, actedAt: undefined } : e)) }))}>Undo</PillBtn>}
          {custom && onEdit && <PillBtn tone="light" onClick={() => onEdit(event)}>Edit reminder</PillBtn>}
          {custom && onDelete && <PillBtn tone="danger" onClick={() => onDelete(event)}>Delete reminder</PillBtn>}
          {!custom && <PillBtn tone="light" onClick={() => nav(`/call/incoming?e=${event.id}`)}>Talk to Smaran</PillBtn>}
        </div>
        <div style={{ textAlign: 'center', marginTop: 4 }}><TextLink color={C.muted} onClick={onClose}>Close</TextLink></div>
      </div>
    </div>
  );
}
