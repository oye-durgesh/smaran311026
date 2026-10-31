import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, ReferenceLine } from 'recharts';
import { Check, Mic, Pencil, Trash2 } from 'lucide-react';
import { useStore } from '../data/store';
import { Back, BottomNav, C, Chip, DemoTag, Dialog, Field, Label, ModeLine, PillBtn, Screen, TextLink } from '../components/ui';
import Gen from './Gen';
import { addReading, bpBand, chartData, deleteReading, fmtWhen, readingsFor, sugarBand, updateReading } from '../services/healthService';
import { SAMPLE_TRANSCRIPTS, voiceService } from '../services/voiceService';
import type { HealthReading, ProfileId, SugarContext } from '../types';

const CONTEXTS: SugarContext[] = ['Fasting', 'Before meal', 'After meal', 'Random'];
const bandColor = (b: string) => (b === 'Normal' ? C.sage : C.orange);

export const readingTitle = (r: HealthReading) => (r.type === 'sugar' ? `${r.value} mg/dL` : `${r.systolic}/${r.diastolic} mmHg${r.pulse ? ` · pulse ${r.pulse}` : ''}`);
export const readingSub = (r: HealthReading) => (r.type === 'sugar' ? [r.contextLabel ?? r.context ?? 'Context not stated'] : ['Blood pressure']).join('');

// ---------- History (23) + empty (27) ----------
export function HealthHistory() {
  const nav = useNavigate();
  const { state, profile, update } = useStore();
  const [tab, setTab] = useState<'all' | 'sugar' | 'bp'>('all');
  const [del, setDel] = useState<HealthReading | null>(null);
  const all = readingsFor(state);
  const shown = all.filter((r) => tab === 'all' || r.type === tab);
  const chartType = tab === 'bp' ? 'bp' : 'sugar';
  const data = useMemo(() => chartData(all, chartType), [all, chartType]);
  const pill = (on: boolean) => ({ padding: '6px 14px', background: on ? C.ink : 'transparent', border: on ? 0 : `1px solid ${C.line}`, borderRadius: 999, fontSize: 13, color: on ? C.paper : C.muted, fontWeight: on ? 500 : 400, font: 'inherit', cursor: 'pointer', minHeight: 36 } as const);

  if (all.length === 0) {
    return (
      <>
        <Screen>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Health History</div></div>
          <ModeLine who={profile.name} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 80 }}>
            <div className="ico-c"><Mic size={36} color={C.ink} strokeWidth={1.5} /></div>
            <div className="sf" style={{ fontSize: 22, marginTop: 24 }}>No readings yet</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 10, maxWidth: 280, lineHeight: 1.5 }}>Your health history will appear here after you record your first reading.</div>
            <div style={{ width: '100%', marginTop: 24 }}><PillBtn onClick={() => nav('/health/record')}>Record a reading</PillBtn></div>
          </div>
        </Screen>
        <BottomNav />
      </>
    );
  }
  return (
    <>
      <Screen>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Health History</div></div>
        </div>
        <ModeLine who={`${profile.name}'s readings`} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button data-act="1" style={pill(tab === 'all')} onClick={() => setTab('all')}>All</button>
          <button data-act="1" style={pill(tab === 'sugar')} onClick={() => setTab('sugar')}>Blood Sugar</button>
          <button data-act="1" style={pill(tab === 'bp')} onClick={() => setTab('bp')}>BP</button>
        </div>
        <div style={{ marginTop: 20, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '16px 8px 8px', height: 160 }} aria-label={chartType === 'sugar' ? 'Blood sugar chart' : 'Blood pressure chart'}>
          {data.length === 0 ? <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', paddingTop: 50 }}>No {chartType === 'sugar' ? 'sugar' : 'BP'} readings to chart yet.</div> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, 'dataMax + 30']} />
                {chartType === 'sugar' && <ReferenceLine y={140} stroke="#C4BAA8" strokeDasharray="3 3" />}
                <Bar dataKey={chartType === 'sugar' ? 'sugar' : 'sys'} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {data.map((d, i) => <Cell key={i} fill={bandColor(chartType === 'sugar' ? sugarBand(d.sugar ?? 0) : bpBand(d.sys ?? 0, d.dia ?? 0))} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: C.muted, justifyContent: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: C.sage }} />Normal</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: C.orange }} />Elevated / borderline</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 24, fontWeight: 500 }}>All readings</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {shown.map((r) => {
            const band = r.type === 'sugar' ? sugarBand(r.value ?? 0) : bpBand(r.systolic ?? 0, r.diastolic ?? 0);
            return (
              <div key={r.id} className="crd" style={{ padding: 14, boxShadow: `inset 3px 0 0 ${bandColor(band)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{readingTitle(r)}{r.type === 'sugar' && r.contextLabel ? ` · ${r.contextLabel}` : ''} <span style={{ fontSize: 11, color: bandColor(band) }}>{band === 'Normal' ? '✓' : '!'} {band}</span></div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fmtWhen(r.at)} {r.demo && <DemoTag />}</div>
                    {r.meal && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Meal: {r.meal}</div>}
                  </div>
                  <button aria-label="Edit reading" data-act="1" onClick={() => nav(`/health/record?edit=${r.id}`)} style={{ width: 40, height: 40, background: 'none', border: 0, cursor: 'pointer' }}><Pencil size={16} color={C.muted} /></button>
                  <button aria-label="Delete reading" data-act="1" onClick={() => setDel(r)} style={{ width: 40, height: 40, background: 'none', border: 0, cursor: 'pointer' }}><Trash2 size={16} color={C.err} /></button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16 }}><PillBtn onClick={() => nav('/health/record')}>Record a reading</PillBtn></div>
      </Screen>
      <BottomNav />
      {del && <Dialog title="Delete this reading?" body={`${readingTitle(del)} · ${fmtWhen(del.at)}`} confirm="Delete" danger onCancel={() => setDel(null)} onConfirm={() => { update((s) => deleteReading(s, del.id)); setDel(null); }} />}
    </>
  );
}

// ---------- Record / review (38, 39) ----------
const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function RecordReading() {
  const nav = useNavigate();
  const [q] = useSearchParams();
  const editId = q.get('edit');
  const { state, update } = useStore();
  const existing = editId ? state.readings.find((r) => r.id === editId) : undefined;

  const [step, setStep] = useState<'capture' | 'review'>(existing ? 'review' : 'capture');
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [type, setType] = useState<'sugar' | 'bp'>(existing?.type ?? 'sugar');
  const [value, setValue] = useState(existing?.value ? String(existing.value) : '');
  const [sys, setSys] = useState(existing?.systolic ? String(existing.systolic) : '');
  const [dia, setDia] = useState(existing?.diastolic ? String(existing.diastolic) : '');
  const [pulse, setPulse] = useState(existing?.pulse ? String(existing.pulse) : '');
  const [context, setContext] = useState<SugarContext | undefined>(existing?.context);
  const [contextLabel, setContextLabel] = useState(existing?.contextLabel);
  const [meal, setMeal] = useState(existing?.meal ?? '');
  const [when, setWhen] = useState(toLocalInput(existing?.at ?? new Date().toISOString()));
  const [who, setWho] = useState<ProfileId>(existing?.profileId ?? state.activeProfileId);
  const [source, setSource] = useState<HealthReading['source']>(existing?.source ?? 'manual');
  const [sample, setSample] = useState(0);

  const record = async () => {
    setListening(true); setProblem(null);
    const text = await voiceService.record(SAMPLE_TRANSCRIPTS[sample % SAMPLE_TRANSCRIPTS.length]);
    setSample((n) => n + 1);
    setTranscript(text); setListening(false); setSource('voice');
  };
  const review = () => {
    const r = voiceService.parseHealth(transcript);
    if (!r.draft) { setProblem(r.problem ?? 'Could not read that.'); return; }
    setProblem(null);
    const d = r.draft;
    setType(d.type);
    if (d.type === 'sugar') { setValue(String(d.value ?? '')); setContext(d.context); setContextLabel(d.contextLabel); setMeal(d.meal ?? ''); setSys(''); setDia(''); }
    else { setSys(String(d.systolic)); setDia(String(d.diastolic)); }
    setStep('review');
  };

  const num = (s: string) => Number(s.replace(/\D/g, ''));
  const valid = type === 'sugar' ? num(value) >= 20 && num(value) <= 700 : num(sys) >= 70 && num(sys) <= 260 && num(dia) >= 40 && num(dia) <= 160 && num(sys) > num(dia);
  const save = () => {
    const base = type === 'sugar'
      ? { type, value: num(value), context, contextLabel: context ? (contextLabel && contextLabel.toLowerCase().includes(context.split(' ')[0].toLowerCase()) ? contextLabel : context) : undefined, meal: meal.trim() || undefined }
      : { type, systolic: num(sys), diastolic: num(dia), pulse: pulse ? num(pulse) : undefined };
    const at = new Date(when).toISOString();
    const id = editId ?? `rd-${Date.now().toString(36)}`;
    update((s) => {
      if (existing) return updateReading(s, existing.id, { ...base, at, profileId: who, value: base.type === 'sugar' ? base.value : undefined, systolic: base.type === 'bp' ? base.systolic : undefined, diastolic: base.type === 'bp' ? base.diastolic : undefined, pulse: base.type === 'bp' ? base.pulse : undefined });
      const s2 = addReading({ ...s, activeProfileId: who }, { ...base, id, at, source });
      const added = s2.readings[s2.readings.length - 1];
      const who2 = s2.profiles.find((p) => p.id === who)?.name ?? '';
      return {
        ...s2, activeProfileId: s.activeProfileId,
        voiceHistory: source === 'voice' ? [...s2.voiceHistory, { id: `vh-${added.id}`, profileId: who, at, kind: 'health-entry', summary: `${base.type === 'sugar' ? `Blood sugar ${base.value} mg/dL` : `BP ${base.systolic}/${base.diastolic}`}${base.type === 'sugar' && base.meal ? `; ${base.meal}` : ''} (${who2}, demo transcription)` }] : s2.voiceHistory,
      };
    });
    setTimeout(() => nav(`/health/saved?id=${id}`, { replace: true }), 0);
  };

  const listeningBox = (
    <div style={{ marginTop: 20, background: C.lav, border: '1px solid #D8CEDB', borderRadius: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 32 }} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 4, height: listening ? 12 : 8, background: C.plum, borderRadius: 2, animation: listening ? `s-wave .9s ${i * 0.12}s infinite` : undefined }} />)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.plum }}>{listening ? 'Listening…' : transcript ? 'Heard you' : 'Ready'} <DemoTag label="DEMO VOICE" /></div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Say something like "Mera sugar aaj 180 aaya, breakfast se pehle"</div>
      </div>
    </div>
  );

  if (step === 'capture') {
    return (
      <Screen bg={C.flow} pad="20px 24px 24px" footer={<PillBtn tone="sage" disabled={!transcript.trim() || listening} onClick={review}>Review reading</PillBtn>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Record reading</div></div>
        {listeningBox}
        <div style={{ marginTop: 14 }}><PillBtn tone="light" disabled={listening} onClick={record}><Mic size={18} style={{ marginRight: 8 }} />{listening ? 'Listening…' : transcript ? 'Record again (demo)' : 'Start recording (demo)'}</PillBtn></div>
        <Label>Transcript — type or edit</Label>
        <textarea aria-label="Transcript" value={transcript} onChange={(e) => { setTranscript(e.target.value); setSource((s) => s) }} placeholder="Type here, e.g. Mera sugar aaj 130 hai, breakfast ke baad…" rows={4} style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, font: 'inherit', fontSize: 16, resize: 'none', color: C.ink }} />
        {problem && (
          <div role="alert" style={{ marginTop: 14, background: 'rgba(183,91,83,.08)', border: '1px solid rgba(183,91,83,.25)', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.err }}>! Could not detect a value</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{problem}</div>
            <div style={{ marginTop: 8 }}><TextLink onClick={() => { setSource('manual'); setStep('review'); }}>Enter manually</TextLink></div>
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 12 }}><TextLink color={C.muted} onClick={() => { setSource('manual'); setStep('review'); }}>Skip voice — enter manually</TextLink></div>
      </Screen>
    );
  }

  const unusual = (type === 'sugar' && valid && (num(value) > 400 || num(value) < 50)) || (type === 'bp' && valid && num(sys) > 200);
  return (
    <Screen bg={C.flow} pad="20px 24px 24px" footer={<PillBtn tone="sage" disabled={!valid} onClick={save}>{existing ? 'Save changes' : 'Confirm & save'}</PillBtn>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back onClick={() => (existing ? nav(-1) : setStep('capture'))} /><div className="sf" style={{ fontSize: 22 }}>{existing ? 'Edit reading' : 'Check this reading'}</div></div>
      {transcript && (<><Label mt={20}>Transcript <DemoTag label="DEMO" /></Label><div style={{ fontSize: 14, fontStyle: 'italic', color: C.muted, marginTop: 8, lineHeight: 1.5 }}>"{transcript}"</div></>)}
      <Label>Type</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Chip on={type === 'sugar'} onClick={() => setType('sugar')}>Blood Sugar</Chip><Chip on={type === 'bp'} onClick={() => setType('bp')}>Blood Pressure</Chip>
      </div>
      {type === 'sugar' ? (
        <>
          <Label>Value (mg/dL)</Label>
          <Field value={value} inputMode="numeric" onChange={setValue} placeholder="Enter value…" focus />
          <Label>Context</Label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {CONTEXTS.map((c) => <Chip key={c} on={context === c} onClick={() => { setContext(context === c ? undefined : c); setContextLabel(undefined); }}>{c}</Chip>)}
          </div>
          {!context && <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Not stated. We don't guess fasting from the time of day.</div>}
          <Label>Meal description (saved with this reading)</Label>
          <Field value={meal} onChange={setMeal} placeholder="e.g. Two rotis and tea" />
        </>
      ) : (
        <>
          <Label>Systolic (upper) · mmHg</Label><Field value={sys} inputMode="numeric" onChange={setSys} placeholder="e.g. 130" focus />
          <Label>Diastolic (lower) · mmHg</Label><Field value={dia} inputMode="numeric" onChange={setDia} placeholder="e.g. 80" />
          <Label>Pulse (optional)</Label><Field value={pulse} inputMode="numeric" onChange={setPulse} placeholder="e.g. 72" />
        </>
      )}
      <Label>Date and time</Label>
      <label className="inp" style={{ marginTop: 10 }}><input className="inp-t" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
      <Label>Family member</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {state.profiles.map((p) => <Chip key={p.id} on={who === p.id} onClick={() => setWho(p.id)}>{p.name}</Chip>)}
      </div>
      {!valid && (value || sys || dia) && <div role="alert" style={{ fontSize: 13, color: C.err, marginTop: 12 }}>! That doesn't look right. Please check the number{type === 'bp' ? 's' : ''}.</div>}
      {unusual && <div role="alert" style={{ fontSize: 13, color: C.terra, marginTop: 12 }}>This value is unusual. Please double-check before saving. This app does not give medical advice.</div>}
    </Screen>
  );
}

// ---------- Saved (40) ----------
export function ReadingSaved() {
  const nav = useNavigate();
  const [q] = useSearchParams();
  const { state, update } = useStore();
  const r = state.readings.find((x) => x.id === q.get('id'));
  if (!r) return <Gen id="40" actions={{ Done: () => nav('/home') }} />;
  const who = state.profiles.find((p) => p.id === r.profileId)?.name;
  const row = (k: string, v: string) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gap: 12 }}><span style={{ fontSize: 14, color: C.muted }}>{k}</span><span style={{ fontSize: 15, fontWeight: 500, textAlign: 'right' }}>{v}</span></div>;
  return (
    <div className="scr" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, boxSizing: 'border-box', overflow: 'auto' }}>
      <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={40} color={C.deep} strokeWidth={2} /></div>
      <div className="sf" style={{ fontSize: 24, marginTop: 24 }}>Reading saved</div>
      <div className="crd" style={{ width: '100%', marginTop: 24 }}>
        {row(r.type === 'sugar' ? 'Blood sugar' : 'Blood pressure', readingTitle(r))}
        {r.type === 'sugar' && row('Context', r.contextLabel ?? r.context ?? 'Not stated')}
        {r.meal && row('Meal', r.meal)}
        {row('For', who ?? '')}
        {row('Recorded', fmtWhen(r.at))}
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
        <PillBtn onClick={() => { update((s) => ({ ...s, activeProfileId: r.profileId })); nav('/home'); }}>Done</PillBtn>
        <PillBtn tone="light" onClick={() => { update((s) => ({ ...s, activeProfileId: r.profileId })); nav('/health'); }}>View health history</PillBtn>
      </div>
    </div>
  );
}

