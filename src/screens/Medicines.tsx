import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, Mic, Plus, ScanLine } from 'lucide-react';
import { useStore } from '../data/store';
import { AddCircle, ReviewCard, StatusPill, timesText } from '../components/MedicineCards';
import { Back, BottomNav, C, Chev, Chip, DemoTag, Dialog, Field, Label, MedIcon, ModeLine, PillBtn, Row, Screen, SectionLabel, TextLink, useToast } from '../components/ui';
import Gen from './Gen';
import * as med from '../services/medicineService';
import { fmtTime, fmtTimeShort, nextLabel, to24 } from '../services/reminderService';
import type { FoodInstruction, Frequency, Medicine, TimeOfDay } from '../types';
import { SAMPLE_MED_VOICE } from '../data/voiceSamples';

// ---------- Setup landing (30) ----------
export function MedicineSetup() {
  const nav = useNavigate();
  const { state, profile } = useStore();
  const list = med.activeMedicines(state);
  const confirmed = list.filter((m) => m.status === 'ready').length;
  const issues = list.length - confirmed;
  const len = list.length ? (81.7 * confirmed) / list.length : 0;
  const tile = (bg: string, col: string, border: string, icon: JSX.Element, t: string, sub: string, to: string) => (
    <button key={t} className="crd" data-act="1" onClick={() => nav(to)} style={{ display: 'flex', alignItems: 'center', gap: 14, borderLeft: `3px solid ${border}`, font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: col }}>{icon}</div>
      <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 500 }}>{t}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{sub}</div></div>
      <Chev />
    </button>
  );
  return (
    <>
      <Screen>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Back /><div><div className="sf" style={{ fontSize: 24 }}>Medicine Setup</div></div></div>
        <div style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>Choose how to add {profile.id === 'self' ? 'your' : `${profile.name}'s`} medicines.</div>
        <div className="crd" style={{ marginTop: 20 }}>
          {list.length === 0 ? <div style={{ fontSize: 15, fontWeight: 500 }}>Not set up yet</div> : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="13" fill="none" stroke={C.line} strokeWidth="2.5" /><circle cx="16" cy="16" r="13" fill="none" stroke={C.sage} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${len} 81.7`} transform="rotate(-90 16 16)" /></svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{confirmed} of {list.length} confirmed</div>
                  <div style={{ fontSize: 12, color: issues ? C.terra : C.deep }}>{issues ? `${issues} medicine${issues > 1 ? 's' : ''} need${issues > 1 ? '' : 's'} review` : 'All set — reminders are active'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {list.map((m) => (
                  <button key={m.id} data-act="1" onClick={() => nav(`/medicines/${m.id}/edit`)} style={{ padding: '3px 10px', background: m.status === 'ready' ? '#E7EDE2' : 'rgba(192,133,96,.12)', borderRadius: 999, fontSize: 11, color: m.status === 'ready' ? C.deep : C.terra, border: 0, font: 'inherit', cursor: 'pointer' }}>{m.name} {m.status === 'ready' ? '✓' : m.status === 'paused' ? 'Ⅱ' : '⚠'}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <SectionLabel mt={28}>Add medicines</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {tile('#E7EDE2', C.deep, C.deep, <ScanLine size={24} strokeWidth={1.5} />, 'Scan prescription', 'Photo or PDF of your prescription', '/medicines/upload')}
          {tile(C.peach, C.orange, C.orange, <Plus size={24} strokeWidth={1.5} />, 'Add manually', 'Enter medicine details yourself', '/medicines/new')}
          {tile(C.lav, C.plum, C.plum, <Mic size={24} strokeWidth={1.5} />, 'Tell Sathi', 'Speak your medicine details aloud', '/medicines/new?voice=1')}
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}

// ---------- Upload (08) & processing (09) ----------
export function UploadRx() {
  const nav = useNavigate();
  const { update } = useStore();
  const start = () => { update(med.startExtraction); nav('/medicines/processing'); };
  return (
    <Gen id="08" actions={{ Skip: () => nav('/home'), 'Upload prescription': start, Camera: start, Gallery: start, 'Add medicine manually': () => nav('/medicines/new'), 'Handwritten prescriptions may need manual confirmation.': () => nav('/errors/partial') }} />
  );
}
export function Processing() {
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => nav('/medicines/review', { replace: true }), 2600);
    return () => clearTimeout(t);
  }, [nav]);
  return <Gen id="09" actions={{}} />;
}
export function RxPartial() {
  const nav = useNavigate();
  const { update } = useStore();
  return <Gen id="45" actions={{ 'Review found medicines': () => { update(med.startExtraction); nav('/medicines/review'); }, 'Retake photo': () => nav('/medicines/upload'), '.bk': () => nav(-1) }} />;
}
export function RxFailed() {
  const nav = useNavigate();
  const { update } = useStore();
  return (
    <Gen id="28" actions={{
      'Try again': () => nav('/medicines/upload'),
      'Add manually': () => nav('/medicines/new'),
      'Device offline — changes saved locally': () => { update((s) => ({ ...s, settings: { ...s.settings, deviceOnline: false } })); nav('/home'); },
      'Mic denied — tap-to-respond available': () => { update((s) => ({ ...s, settings: { ...s.settings, micAllowed: false } })); nav('/health/record'); },
      'Call failed — retry or text response': () => nav('/call/reconnecting'),
      'Sync pending — waiting for parent': () => nav('/parent/mother/remote'),
    }} />
  );
}

// ---------- Review (10) ----------
export function Review() {
  const nav = useNavigate();
  const { state, update } = useStore();
  const ex = state.extraction;
  if (!ex) return <NoExtraction />;
  const done = ex.items.filter((m) => m.status === 'ready').length;
  return (
    <Screen bg={C.flow} pad="20px 24px 24px" footer={<PillBtn onClick={() => nav('/medicines/finalize')}>Continue</PillBtn>}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Back />
        <div style={{ padding: '4px 12px', background: '#E7EDE2', borderRadius: 999, fontSize: 13, color: C.deep, fontWeight: 500 }}>{done} of {ex.items.length} reviewed</div>
      </div>
      <div className="sf" style={{ fontSize: 24, marginTop: 20 }}>Medicines found</div>
      <div style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>Review each medicine before setting reminders. <DemoTag label="DEMO EXTRACTION" /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
        {ex.items.map((m) => <ReviewCard key={m.id} m={m} onReview={() => nav(`/medicines/schedule/${m.id}?x=1`)} onRemove={() => update((s) => med.removeExtracted(s, m.id))} />)}
      </div>
      <button data-act="1" onClick={() => nav('/medicines/new?x=1')} style={{ margin: '16px auto 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.sage, fontWeight: 500, background: 'none', border: 0, font: 'inherit', cursor: 'pointer', padding: 8 }}><Plus size={16} /> Add another medicine</button>
    </Screen>
  );
}
function NoExtraction() {
  const nav = useNavigate();
  return (
    <Screen bg={C.flow} footer={<PillBtn onClick={() => nav('/medicines/upload')}>Upload a prescription</PillBtn>}>
      <Back />
      <div className="sf" style={{ fontSize: 24, marginTop: 20 }}>Nothing to review</div>
      <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>Upload a prescription to see the medicines we find.</div>
    </Screen>
  );
}

// ---------- Schedule editor (11) ----------
const FREQ: Frequency[] = ['Once daily', 'Twice daily', 'Thrice', 'Custom'];
const TOD: TimeOfDay[] = ['Morning', 'Afternoon', 'Evening', 'Night'];
const FOOD: FoodInstruction[] = ['Before food', 'With food', 'After food', 'No instruction'];
const countFor = (f: Frequency, cur: number) => (f === 'Once daily' ? 1 : f === 'Twice daily' ? 2 : f === 'Thrice' ? 3 : Math.max(cur, 1));

function TimePill({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label style={{ marginTop: 12, height: 48, padding: '0 16px', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 15, fontWeight: 500 }}>{fmtTime(value)}</span>
      <input aria-label={label} type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} style={{ border: 0, background: 'transparent', font: 'inherit', fontSize: 13, color: C.faint }} />
    </label>
  );
}

export function ScheduleEditor() {
  const nav = useNavigate();
  const { id } = useParams();
  const [q] = useSearchParams();
  const fromRx = q.get('x') === '1';
  const { state, update } = useStore();
  const m: Medicine | undefined = fromRx ? state.extraction?.items.find((x) => x.id === id) : state.medicines.find((x) => x.id === id);
  const [f, setF] = useState<Medicine | undefined>(m);
  const [foodTouched, setFoodTouched] = useState(false);
  if (!m || !f) return <Missing />;
  const needsFood = fromRx && m.status === 'needs_review' && !foodTouched && m.food === 'No instruction';
  const set = (p: Partial<Medicine>) => setF({ ...f, ...p });
  const setFreq = (fr: Frequency) => {
    const n = countFor(fr, f.times.length);
    const base = med.timesFor(fr, f.timeOfDay);
    set({ frequency: fr, times: Array.from({ length: n }, (_, i) => f.times[i] ?? base[i] ?? '20:00') });
  };
  const save = () => {
    if (fromRx) update((s) => med.confirmExtracted(s, f.id, f));
    else update((s) => med.updateMedicine(s, f.id, { ...f, status: f.status === 'paused' ? 'paused' : 'ready' }));
    nav(-1);
  };
  return (
    <Screen bg={C.flow} pad="20px 24px 24px" footer={<PillBtn tone="sage" disabled={!f.strength.trim() || needsFood} onClick={save}>Confirm schedule</PillBtn>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Back />
        <div><div style={{ fontSize: 13, color: C.faint }}>Edit schedule for</div><div className="sf" style={{ fontSize: 20 }}>{med.medicineLabel(f)}</div></div>
      </div>
      {f.originalRx && <div style={{ fontSize: 12, color: C.terra, marginTop: 12 }}>Original Rx text kept: "{f.originalRx}"</div>}
      <Label mt={24}>Strength</Label><Field value={f.strength} onChange={(v) => set({ strength: v })} placeholder="e.g. 50mg" />
      <Label>Dose</Label><Field value={f.dose} onChange={(v) => set({ dose: v })} placeholder="e.g. 1 tablet" />
      <Label>Frequency</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{FREQ.map((x) => <Chip key={x} on={f.frequency === x} onClick={() => setFreq(x)}>{x}</Chip>)}</div>
      <Label>Time of day</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{TOD.map((x) => <Chip key={x} on={f.timeOfDay === x} onClick={() => set({ timeOfDay: x, times: f.times.map((t, i) => (i === 0 ? med.timesFor('Once daily', x)[0] : t)) })}>{x}</Chip>)}</div>
      {f.times.map((t, i) => <TimePill key={i} label={`Reminder time ${i + 1}`} value={t} onChange={(v) => set({ times: f.times.map((o, j) => (j === i ? v : o)) })} />)}
      {f.frequency === 'Custom' && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <TextLink onClick={() => set({ times: [...f.times, '12:00'] })}>+ Add time</TextLink>
          {f.times.length > 1 && <TextLink color={C.err} onClick={() => set({ times: f.times.slice(0, -1) })}>Remove last</TextLink>}
        </div>
      )}
      <Label>Food instructions</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{FOOD.map((x) => <Chip key={x} on={f.food === x && !needsFood} onClick={() => { setFoodTouched(true); set({ food: x }); }}>{x}</Chip>)}</div>
      {needsFood && <div role="alert" style={{ fontSize: 13, color: C.terra, marginTop: 10 }}>The prescription doesn't say. Please choose a food instruction to confirm.</div>}
      <Label>Duration</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{(['Ongoing', 'Fixed course'] as const).map((x) => <Chip key={x} on={f.duration === x} onClick={() => set({ duration: x })}>{x}</Chip>)}</div>
      {f.duration === 'Fixed course' && (
        <Field value={String(f.courseDays ?? '')} inputMode="numeric" onChange={(v) => set({ courseDays: Number(v.replace(/\D/g, '')) || undefined })} placeholder="Number of days" />
      )}
      <Label>Start date</Label>
      <label className="inp" style={{ marginTop: 10 }}><input className="inp-t" type="date" value={f.startedOn} onChange={(e) => set({ startedOn: e.target.value })} /></label>
      <Label>End date (optional)</Label>
      <label className="inp" style={{ marginTop: 10 }}><input className="inp-t" type="date" value={f.endedOn ?? ''} onChange={(e) => set({ endedOn: e.target.value || undefined })} /></label>
    </Screen>
  );
}
function Missing() {
  const nav = useNavigate();
  return <Screen><Back /><div className="sf" style={{ fontSize: 22, marginTop: 20 }}>Medicine not found</div><div style={{ marginTop: 12 }}><PillBtn onClick={() => nav('/medicines')}>Back to medicines</PillBtn></div></Screen>;
}

// ---------- Finalize (12) ----------
export function Finalize() {
  const nav = useNavigate();
  const { state, update } = useStore();
  const ex = state.extraction;
  if (!ex) return <NoExtraction />;
  const issues = med.extractionIssues(state);
  const confirmed = ex.items.length - issues.length;
  const reminders = ex.items.reduce((n, m) => n + m.times.length, 0);
  const slots = new Map<string, string[]>();
  ex.items.forEach((m) => m.times.forEach((t) => slots.set(t, [...(slots.get(t) ?? []), m.name])));
  const sorted = [...slots.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <Screen bg={C.flow} pad="20px 24px 24px" footer={
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PillBtn tone="sage" disabled={issues.length > 0 || ex.items.length === 0} onClick={() => { update(med.activateExtraction); nav('/medicines/done'); }}>Confirm &amp; activate reminders</PillBtn>
        <div style={{ textAlign: 'center' }}><TextLink color={C.muted} onClick={() => { update(med.saveExtractionDraft); nav('/home'); }}>Save and finish later</TextLink></div>
      </div>
    }>
      <Back />
      <div className="sf" style={{ fontSize: 24, marginTop: 20 }}>Review your routine</div>
      <div style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>{ex.items.length} medicines · {confirmed} confirmed · {reminders} daily reminders</div>
      {issues.length > 0 && (
        <div role="alert" style={{ marginTop: 14, background: 'rgba(192,133,96,.12)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#8A5A3A' }}>
          ! Remaining issues: {issues.map((m) => m.name).join(', ')} still need{issues.length === 1 ? 's' : ''} review before reminders can start.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        {ex.items.map((m) => (
          <button key={m.id} data-act="1" onClick={() => nav(`/medicines/schedule/${m.id}?x=1`)} style={{ background: '#fff', border: `1px solid ${m.status === 'ready' ? C.line : C.terra}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <MedIcon g={m.gradient} size={36} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{med.medicineLabel(m)}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{m.status === 'ready' ? `${timesText(m)} · ${m.food === 'No instruction' ? m.timeOfDay : m.food}` : 'Needs review — not scheduled yet'}</div>
            </div>
            <Chev />
          </button>
        ))}
      </div>
      <div className="sep" />
      <div style={{ fontSize: 13, fontWeight: 500 }}>Reminder schedule</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, fontSize: 13, color: C.muted }}>
        {sorted.map(([t, names]) => <div key={t} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{fmtTimeShort(t)}</span><span style={{ color: C.ink, textAlign: 'right' }}>{names.join(', ')}</span></div>)}
      </div>
    </Screen>
  );
}

export function SetupDone() {
  const nav = useNavigate();
  const { profile } = useStore();
  const toast = useToast();
  return (
    <>
      <Gen id="33" replace={{ "You're all set, Ramesh.": `You're all set, ${profile.name}.` }} actions={{ 'Go to Home': () => nav('/home'), 'Hear Sathi say this': () => toast.show('Demo: Sathi voice preview is simulated') }} />
      {toast.node}
    </>
  );
}

// ---------- Medicines list (15) ----------
export function MedicinesList() {
  const nav = useNavigate();
  const { state } = useStore();
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const all = med.mine(state);
  const shown = all.filter((m) => (tab === 'active' ? !m.completed : m.completed));
  const pill = (on: boolean) => ({ padding: '6px 14px', background: on ? C.ink : 'transparent', border: on ? 0 : `1px solid ${C.line}`, borderRadius: 999, fontSize: 13, color: on ? C.paper : C.muted, fontWeight: on ? 500 : 400, font: 'inherit', cursor: 'pointer', minHeight: 36 } as const);
  return (
    <>
      <Screen>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sf" style={{ fontSize: 24 }}>Medicines</div>
          <AddCircle onClick={() => nav('/medicines/setup')} />
        </div>
        <ModeLine who={`${state.profiles.find((p) => p.id === state.activeProfileId)?.name ?? 'You'} · medicines`} />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button data-act="1" style={pill(tab === 'active')} onClick={() => setTab('active')}>Active · {all.filter((m) => !m.completed).length}</button>
          <button data-act="1" style={pill(tab === 'completed')} onClick={() => setTab('completed')}>Completed</button>
        </div>
        {shown.length === 0 && <div style={{ fontSize: 14, color: C.muted, marginTop: 24 }}>{tab === 'active' ? 'No medicines yet. Tap + to add one.' : 'No completed medicines.'}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {shown.map((m) => (
            <div key={m.id} className="crd" role="button" data-act="1" onClick={() => nav(`/medicines/${m.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, cursor: 'pointer' }}>
              <MedIcon g={m.gradient} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{med.medicineLabel(m)} {m.demo && <DemoTag label="DEMO" />}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{m.frequency} · {m.food === 'No instruction' ? m.timeOfDay : m.food}</div>
                <div style={{ fontSize: 12, color: m.status === 'ready' ? C.sage : C.terra, marginTop: 4 }}>{m.status === 'ready' ? nextLabel(state, m) : m.status === 'paused' ? 'Ⅱ Paused' : '! Needs review'}</div>
              </div>
              <Chev />
            </div>
          ))}
        </div>
        <button data-act="1" onClick={() => nav('/medicines/upload')} style={{ margin: '16px auto 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.sage, fontWeight: 500, background: 'none', border: 0, font: 'inherit', cursor: 'pointer', padding: 8 }}><Camera size={16} /> Scan another prescription</button>
      </Screen>
      <BottomNav />
    </>
  );
}

// ---------- Detail sheet (29) ----------
export function MedicineDetail() {
  const nav = useNavigate();
  const { id } = useParams();
  const { state, update, profile } = useStore();
  const m = state.medicines.find((x) => x.id === id);
  if (!m) return <Missing />;
  return (
    <div className="scr" style={{ background: 'rgba(46,36,27,.35)' }}>
      <div onClick={() => nav(-1)} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '25%', background: C.paper, opacity: 0.55, padding: 24, boxSizing: 'border-box' }}>
        <div className="sf" style={{ fontSize: 22, opacity: 0.9 }}>{profile.name}'s medicines</div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.paper, borderRadius: '24px 24px 0 0', padding: '12px 24px 32px', boxSizing: 'border-box', height: '75%', overflow: 'auto' }}>
        <button aria-label="Close" data-act="1" onClick={() => nav(-1)} style={{ display: 'block', width: 36, height: 4, background: C.line, borderRadius: 2, margin: '0 auto 20px', border: 0, padding: 0, cursor: 'pointer' }} />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <MedIcon g={m.gradient} size={56} />
          <div><div className="sf" style={{ fontSize: 22 }}>{med.medicineLabel(m)}</div><div style={{ fontSize: 14, color: C.muted }}>{m.forCondition ? `For ${m.forCondition}` : 'Medicine'} {m.demo && <DemoTag label="DEMO" />}</div></div>
        </div>
        <div className="sep" />
        <Row k="Status" v={<StatusPill m={m} />} />
        <Row k="Schedule" v={timesText(m)} />
        <Row k="Frequency" v={m.frequency} />
        <Row k="Food" v={m.food} />
        <Row k="Duration" v={m.duration === 'Fixed course' && m.courseDays ? `${m.courseDays} days` : m.duration} />
        <Row k="Started" v={m.startedOn ? new Date(m.startedOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
        {m.endedOn && <Row k="Ended" v={new Date(m.endedOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <PillBtn onClick={() => nav(`/medicines/${m.id}/edit`)}>Edit schedule</PillBtn>
          <PillBtn tone="light" onClick={() => update((s) => med.togglePause(s, m.id))}>{m.status === 'paused' ? 'Resume reminders' : 'Pause reminders'}</PillBtn>
        </div>
      </div>
    </div>
  );
}

// ---------- Edit (32) ----------
export function EditMedicine() {
  const nav = useNavigate();
  const { id } = useParams();
  const { state, update } = useStore();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const m = state.medicines.find((x) => x.id === id);
  if (!m) return <Missing />;
  const row = (k: string, v: string) => (
    <button key={k} data-act="1" onClick={() => nav(`/medicines/schedule/${m.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '14px 0', background: 'none', border: 0, borderBottom: `1px solid ${C.line}`, font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ fontSize: 14, color: C.muted }}>{k}</span><span style={{ fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>{v}<Chev /></span>
    </button>
  );
  const act = (label: string, onClick: () => void, color = C.ink) => (
    <button key={label} className="crd" data-act="1" onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', font: 'inherit', fontSize: 15, color, cursor: 'pointer', textAlign: 'left', width: '100%' }}>{label}<Chev color={color} /></button>
  );
  return (
    <Screen bg={C.flow} pad="20px 24px 24px" footer={<PillBtn tone="sage" onClick={() => nav('/medicines')}>Save changes</PillBtn>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div><div style={{ fontSize: 13, color: C.faint }}>Editing</div><div className="sf" style={{ fontSize: 20 }}>{med.medicineLabel(m)}</div></div></div>
      <div style={{ marginTop: 20 }}>
        {row('Strength', m.strength)}{row('Dose', m.dose)}{row('Frequency', m.frequency)}{row('Times', timesText(m))}{row('Food', m.food)}{row('Duration', m.duration)}
      </div>
      <div style={{ fontSize: 12, color: C.faint, marginTop: 12 }}>Tap any field above to edit. Changes apply after confirmation.</div>
      <SectionLabel mt={24}>Actions</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {act('Change reminder times', () => nav(`/medicines/schedule/${m.id}`))}
        {act(m.status === 'paused' ? 'Resume reminders' : 'Pause reminders', () => update((s) => med.togglePause(s, m.id)))}
        {act(m.completed ? 'Mark active again' : 'Mark discontinued', () => update((s) => med.updateMedicine(s, m.id, { completed: !m.completed, endedOn: m.completed ? undefined : new Date().toISOString().slice(0, 10), status: m.completed ? 'ready' : 'paused' })))}
        {act('Remove medicine', () => setConfirmRemove(true), C.err)}
      </div>
      {confirmRemove && <Dialog title="Remove this medicine?" body={`${med.medicineLabel(m)} and its reminders will be deleted.`} confirm="Remove" danger onCancel={() => setConfirmRemove(false)} onConfirm={() => { update((s) => med.removeMedicine(s, m.id)); nav('/medicines', { replace: true }); }} />}
    </Screen>
  );
}

// ---------- Add manual (31) ----------
export function AddManual() {
  const nav = useNavigate();
  const [q] = useSearchParams();
  const voice = q.get('voice') === '1';
  const fromRx = q.get('x') === '1';
  const { update, profile } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const seed = voice ? SAMPLE_MED_VOICE : null;
  const [name, setName] = useState(seed?.name ?? '');
  const [strength, setStrength] = useState(seed?.strength ?? '');
  const [dose, setDose] = useState(seed?.dose ?? '');
  const [frequency, setFrequency] = useState<Frequency>(seed?.frequency ?? 'Once daily');
  const [tod, setTod] = useState<TimeOfDay>('Morning');
  const [food, setFood] = useState<FoodInstruction | null>(seed?.food ?? null);
  const [duration, setDuration] = useState<'Ongoing' | 'Fixed course'>('Ongoing');
  const ok = name.trim().length > 1 && strength.trim() && food;
  const submit = () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const input = { name, strength, dose, frequency, timeOfDay: tod, food: food!, duration };
      update((s) => (fromRx ? med.addExtractedManual(s, input) : med.addMedicine(s, input)));
      toast.show(`Added ${name.trim()} for ${profile.name}`);
      nav(fromRx ? '/medicines/review' : '/medicines', { replace: true });
    } finally { setBusy(false); }
  };
  return (
    <>
    <Screen bg={C.flow} pad="20px 24px 24px" footer={<PillBtn tone="sage" disabled={!ok || busy} onClick={submit}>{busy ? 'Saving…' : fromRx ? 'Add to review list' : 'Add medicine'}</PillBtn>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Add medicine</div></div>
      <ModeLine who={profile.name} />
      {voice && <div style={{ marginTop: 14, background: C.lav, borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.plum }}><DemoTag label="DEMO VOICE" /> Sathi heard: "{SAMPLE_MED_VOICE.heard}". Please check everything before adding.</div>}
      <Label mt={24}>Medicine name</Label><Field value={name} onChange={setName} placeholder="e.g. Metoprolol" autoFocus />
      <Label>Strength</Label><Field value={strength} onChange={setStrength} placeholder="e.g. 50mg" />
      <Label>Dose</Label><Field value={dose} onChange={setDose} placeholder="e.g. 1 tablet" />
      <Label>Frequency</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{FREQ.map((x) => <Chip key={x} on={frequency === x} onClick={() => setFrequency(x)}>{x}</Chip>)}</div>
      <Label>Time</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{TOD.map((x) => <Chip key={x} on={tod === x} onClick={() => setTod(x)}>{x}</Chip>)}</div>
      <Label>Food instructions</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{FOOD.map((x) => <Chip key={x} on={food === x} onClick={() => setFood(x)}>{x}</Chip>)}</div>
      {!food && <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Please choose one — we don't guess.</div>}
      <Label>Duration</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{(['Ongoing', 'Fixed course'] as const).map((x) => <Chip key={x} on={duration === x} onClick={() => setDuration(x)}>{x}</Chip>)}</div>
    </Screen>
    {toast.node}
    </>
  );
}


