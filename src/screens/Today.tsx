import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useStore } from '../data/store';
import { AddCircle } from '../components/MedicineCards';
import { Back, BottomNav, C, Chip, Dialog, Field, Label, ModeLine, PillBtn, Screen, useToast } from '../components/ui';
import ReminderSheet from '../components/ReminderSheet';
import { doseFace, eventsFor, fmtTime, historyFor } from '../services/reminderService';
import { customReminder, removeReminder } from '../services/dataService';
import { todayLong } from './Home';
import { isoDate } from '../data/demoData';
import type { ReminderEvent } from '../types';

function eventLabel(state: ReturnType<typeof useStore>['state'], e: ReminderEvent) {
  if (e.kind === 'custom' || e.kind === 'appointment') return e.title || 'Reminder';
  const m = state.medicines.find((x) => x.id === e.medicineId);
  return m ? `${m.name} ${m.strength}` : e.title || 'Reminder';
}

/** Today's Reminders timeline (46). Events at the same time are grouped like the design. */
export function Today() {
  const { state, profile, update } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [sheet, setSheet] = useState<ReminderEvent | null>(null);
  const [form, setForm] = useState<ReminderEvent | 'new' | null>(null);
  const [del, setDel] = useState<ReminderEvent | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(isoDate(new Date()));
  const [time, setTime] = useState('09:00');
  const [recurrence, setRecurrence] = useState<ReminderEvent['recurrence']>('none');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const events = eventsFor(state);
  const pending = events.filter((e) => e.status !== 'taken' && e.status !== 'skipped');
  const done = events.filter((e) => e.status === 'taken' || e.status === 'skipped');
  const shown = tab === 'pending' ? pending : done;
  const groups = new Map<string, ReminderEvent[]>();
  shown.forEach((e) => groups.set(e.time, [...(groups.get(e.time) ?? []), e]));
  const open = (e?: ReminderEvent) => {
    setForm(e ?? 'new');
    setTitle(e?.title ?? ''); setNotes(e?.notes ?? '');
    setDate(e?.date ?? isoDate(new Date())); setTime(e?.time ?? '09:00');
    setRecurrence(e?.recurrence ?? 'none');
  };
  const save = () => {
    if (title.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const id = form && form !== 'new' ? form.id : undefined;
      update((s) => customReminder(s, { id, title, notes, date, time, profileId: s.activeProfileId, recurrence }));
      toast.show(id ? 'Reminder updated' : 'Reminder saved');
      setForm(null);
    } finally { setBusy(false); }
  };
  const pill = (on: boolean) => ({ padding: '6px 14px', background: on ? C.ink : 'transparent', border: on ? 0 : `1px solid ${C.line}`, borderRadius: 999, fontSize: 13, color: on ? C.paper : C.muted, font: 'inherit', cursor: 'pointer', minHeight: 36 } as const);
  return (
    <>
      <Screen>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Today's Reminders</div></div>
          <AddCircle label="Add reminder" onClick={() => open()} />
        </div>
        <ModeLine who={profile.name} />
        <div style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>{todayLong()} · {profile.name}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button data-act="1" style={pill(tab === 'pending')} onClick={() => setTab('pending')}>Pending · {pending.length}</button>
          <button data-act="1" style={pill(tab === 'done')} onClick={() => setTab('done')}>Completed · {done.length}</button>
        </div>
        {groups.size === 0 && <div style={{ fontSize: 14, color: C.muted, marginTop: 24 }}>{tab === 'pending' ? 'No pending reminders today.' : 'Nothing completed today yet.'}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24, paddingLeft: 20, borderLeft: `2px solid ${C.line}` }}>
          {[...groups.entries()].map(([t, es]) => {
            const all = es.every((e) => e.status === 'taken');
            const faces = es.map((e) => doseFace(e.status, e.date, e.time, new Date(), e.snoozedUntil));
            const overdue = faces.some((f) => f === 'missed' || f === 'overdue');
            const due = faces.some((f) => f === 'due');
            const col = all ? C.sage : overdue ? C.err : due ? C.orange : C.orange;
            const label = es.map((e) => eventLabel(state, e)).join(' · ');
            const sub = all ? `Taken at ${new Date(es[0].actedAt ?? Date.now()).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} (self-reported)` : overdue ? 'Overdue' : es.every((e) => e.status === 'skipped') ? 'Skipped' : due ? 'Due now' : 'Upcoming';
            return (
              <button key={t} data-act="1" onClick={() => setSheet(es.find((e) => e.status !== 'taken') ?? es[0])} style={{ position: 'relative', paddingLeft: 20, paddingBottom: 24, background: 'none', border: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ position: 'absolute', left: -9, top: 2, width: 16, height: 16, borderRadius: '50%', background: all ? C.sage : col, border: all ? 0 : `2px solid ${C.peach}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{all && <Check size={9} color="#fff" strokeWidth={3} />}</div>
                <div style={{ fontSize: 12, color: all ? C.muted : col, fontWeight: all ? 400 : 500 }}>{fmtTime(t)}{!all && ` · ${overdue ? '! Overdue' : due ? 'Due now' : 'Upcoming'}`}</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: all ? C.sage : C.muted, marginTop: 2 }}>{sub}</div>
              </button>
            );
          })}
        </div>
        <button data-act="1" onClick={() => nav('/history')} style={{ display: 'block', margin: '8px auto 0', background: 'none', border: 0, font: 'inherit', fontSize: 14, color: C.sage, cursor: 'pointer', padding: 8 }}>View medicine history</button>
      </Screen>
      <BottomNav />
      {sheet && (
        <ReminderSheet
          event={state.events.find((e) => e.id === sheet.id) ?? sheet}
          onClose={() => setSheet(null)}
          onEdit={(e) => { setSheet(null); if (e.kind === 'custom') open(e); }}
          onDelete={(e) => { setSheet(null); setDel(e); }}
        />
      )}
      {form && (
        <div role="dialog" aria-modal="true" style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.35)', zIndex: 30 }} onClick={() => setForm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.paper, borderRadius: '24px 24px 0 0', padding: '12px 24px 32px' }}>
            <div style={{ width: 36, height: 4, background: C.line, borderRadius: 2, margin: '0 auto 12px' }} />
            <div className="sf" style={{ fontSize: 20 }}>{form === 'new' ? 'Add reminder' : 'Edit reminder'}</div>
            <Label>Title</Label><Field value={title} onChange={setTitle} placeholder="e.g. Drink water" autoFocus />
            <Label>Description</Label><Field value={notes} onChange={setNotes} placeholder="Optional notes" />
            <Label>Category</Label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><Chip on>Custom</Chip></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label className="inp" style={{ marginTop: 10, flex: 1 }}><input className="inp-t" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="inp" style={{ marginTop: 10, flex: 1 }}><input className="inp-t" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            </div>
            <Label>Repeat</Label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {(['none', 'daily', 'weekly'] as const).map((r) => <Chip key={r} on={recurrence === r} onClick={() => setRecurrence(r)}>{r === 'none' ? 'Once' : r === 'daily' ? 'Daily' : 'Weekly'}</Chip>)}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <PillBtn tone="light" onClick={() => setForm(null)}>Cancel</PillBtn>
              <PillBtn tone="sage" disabled={title.trim().length < 2 || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</PillBtn>
            </div>
          </div>
        </div>
      )}
      {del && <Dialog title="Delete this reminder?" body={eventLabel(state, del)} confirm="Delete" danger onCancel={() => setDel(null)} onConfirm={() => { update((s) => removeReminder(s, del.id)); setDel(null); toast.show('Reminder deleted'); }} />}
      {toast.node}
    </>
  );
}

/** Medicine history: every logged reminder outcome for this profile. */
export function MedicineHistory() {
  const { state } = useStore();
  const rows = historyFor(state).slice(0, 60);
  return (
    <>
      <Screen>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Medicine history</div></div>
        {rows.length === 0 && <div style={{ fontSize: 14, color: C.muted, marginTop: 24 }}>Nothing logged yet.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {rows.map((e) => {
            const m = state.medicines.find((x) => x.id === e.medicineId);
            const label = e.kind === 'custom' ? (e.title || 'Reminder') : m ? `${m.name} ${m.strength}` : e.title || 'Reminder';
            const col = e.status === 'taken' ? C.sage : e.status === 'missed' ? C.err : C.faint;
            return (
              <div key={e.id} className="crd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: `inset 3px 0 0 ${col}`, padding: 14 }}>
                <div><div style={{ fontSize: 15, fontWeight: 500 }}>{label}</div><div style={{ fontSize: 12, color: C.muted }}>{e.date} · {fmtTime(e.time)}</div></div>
                <span style={{ fontSize: 12, color: col, textTransform: 'capitalize' }}>{e.status === 'taken' ? '✓ Taken (self-reported)' : e.status === 'missed' ? '! Missed' : e.status}</span>
              </div>
            );
          })}
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}
