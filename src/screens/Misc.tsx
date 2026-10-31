import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar, Check, ChevronRight, Globe, HelpCircle, LogOut, Mic, Moon, Plus, RotateCcw, Shield, Type, Users, WifiOff } from 'lucide-react';
import { useStore } from '../data/store';
import { AddCircle } from '../components/MedicineCards';
import { Back, BottomNav, C, Chev, Chip, Choice, DemoTag, Dialog, Field, Label, ModeLine, PillBtn, Screen, SectionLabel, TextLink, Toggle, useToast } from '../components/ui';
import type { Appointment, ProfileId, Settings as SettingsT } from '../types';
import { isoDate } from '../data/demoData';
import { liveFlag } from '../services/dataService';
import { stopSync } from '../services/sync';
import { signOut as authSignOut } from '../services/backend';
import { notificationsSupported, requestBrowserNotifications } from '../services/notifyService';

const fmtAppt = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).replace(',', ',').replace(' at', ' ·');

// ---------- Appointments (25) ----------
export function Appointments() {
  const { state, profile, update } = useStore();
  const toast = useToast();
  const [form, setForm] = useState<Appointment | null>(null);
  const [del, setDel] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [doctor, setDoctor] = useState('');
  const [clinic, setClinic] = useState('');
  const [date, setDate] = useState(isoDate(new Date(Date.now() + 86400000)));
  const [time, setTime] = useState('10:00');
  const [note, setNote] = useState('');
  const [who, setWho] = useState<ProfileId>(profile.id);
  const open = (a?: Appointment) => {
    setForm(a ?? { id: '', profileId: profile.id, title: '', at: '', status: 'upcoming' });
    setTitle(a?.title ?? ''); setDoctor(a?.doctor ?? ''); setClinic(a?.clinic ?? '');
    setNote(a?.note ?? ''); setWho(a?.profileId ?? profile.id);
    if (a?.at) { const d = new Date(a.at); setDate(isoDate(d)); setTime(d.toTimeString().slice(0, 5)); }
  };
  const list = state.appointments.filter((a) => a.profileId === profile.id);
  const up = list.filter((a) => a.status === 'upcoming').sort((a, b) => a.at.localeCompare(b.at));
  const past = list.filter((a) => a.status !== 'upcoming').sort((a, b) => b.at.localeCompare(a.at));
  const save = () => {
    if (title.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const at = new Date(`${date}T${time}`).toISOString();
      if (form?.id) {
        update((s) => ({ ...s, appointments: s.appointments.map((x) => (x.id === form.id ? { ...x, title: title.trim(), doctor: doctor.trim() || undefined, clinic: clinic.trim() || undefined, note: note.trim() || undefined, at, profileId: who } : x)) }));
        toast.show('Appointment updated');
      } else {
        const a: Appointment = { id: `ap-${Date.now()}`, profileId: who, title: title.trim(), doctor: doctor.trim() || undefined, clinic: clinic.trim() || undefined, at, note: note.trim() || undefined, reminder: 'Reminder the evening before', status: 'upcoming', demo: liveFlag() };
        update((s) => ({ ...s, appointments: [...s.appointments, a] }));
        toast.show(`Appointment saved for ${state.profiles.find((p) => p.id === who)?.name ?? 'you'}`);
      }
      setForm(null);
    } finally { setBusy(false); }
  };
  const set = (id: string, patch: Partial<Appointment>) => update((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  return (
    <>
      <Screen>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Appointments</div></div>
          <AddCircle label="Add appointment" onClick={() => open()} />
        </div>
        <ModeLine who={profile.name} />
        <div style={{ fontSize: 13, color: C.faint, marginTop: 8 }}>Appointments for {profile.name}. Sathi will show these in the app; push notifications are not connected.</div>
        <SectionLabel>Upcoming</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {up.length === 0 && <div style={{ fontSize: 14, color: C.muted }}>No upcoming appointments. Tap + to add one.</div>}
          {up.map((a, i) => (
            <div key={a.id} className="crd" style={{ borderLeft: `3px solid ${i % 2 ? C.orange : C.deep}` }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: i % 2 ? C.peach : '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Calendar size={20} color={i % 2 ? C.orange : C.deep} strokeWidth={1.5} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{a.title} {a.demo && <DemoTag />}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{fmtAppt(a.at)}</div>
                  {(a.doctor || a.clinic) && <div style={{ fontSize: 12, color: C.muted }}>{[a.doctor, a.clinic].filter(Boolean).join(' · ')}</div>}
                  {(a.note || a.reminder) && <div style={{ fontSize: 12, color: i % 2 ? C.orange : C.deep, marginTop: 2 }}>{a.note ?? a.reminder}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button data-act="1" onClick={() => open(a)} style={{ padding: '8px 14px', background: C.card, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 999, font: 'inherit', fontSize: 13, cursor: 'pointer' }}>Edit</button>
                <button data-act="1" onClick={() => set(a.id, { status: 'completed' })} style={{ padding: '8px 14px', background: '#E7EDE2', color: C.deep, border: 0, borderRadius: 999, font: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>✓ Mark completed</button>
                <button data-act="1" onClick={() => set(a.id, { status: 'cancelled' })} style={{ padding: '8px 14px', background: 'none', color: C.err, border: 0, font: 'inherit', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button data-act="1" onClick={() => setDel(a)} style={{ padding: '8px 14px', background: 'none', color: C.err, border: 0, font: 'inherit', fontSize: 13, cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <SectionLabel mt={28}>Past</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {past.length === 0 && <div style={{ fontSize: 14, color: C.muted }}>Completed appointments appear here.</div>}
          {past.map((a) => (
            <div key={a.id} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, opacity: 0.7 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={18} color={C.muted} /></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{a.title}</div><div style={{ fontSize: 13, color: C.muted }}>{new Date(a.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {a.status === 'cancelled' ? 'Cancelled' : 'Completed'}</div></div>
            </div>
          ))}
        </div>
      </Screen>
      <BottomNav />
      {form && (
        <div role="dialog" aria-modal="true" aria-label="Appointment" style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.35)', zIndex: 30 }} onClick={() => setForm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.paper, borderRadius: '24px 24px 0 0', padding: '12px 24px 32px', boxSizing: 'border-box', maxHeight: '90%', overflow: 'auto' }}>
            <div style={{ width: 36, height: 4, background: C.line, borderRadius: 2, margin: '0 auto 12px' }} />
            <div className="sf" style={{ fontSize: 20 }}>{form.id ? 'Edit appointment' : 'Add appointment'}</div>
            <Label>For</Label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{state.profiles.map((p) => <Chip key={p.id} on={who === p.id} onClick={() => setWho(p.id)}>{p.name}</Chip>)}</div>
            <Field value={title} onChange={setTitle} placeholder="e.g. Cardiology checkup" autoFocus />
            <Field value={doctor} onChange={setDoctor} placeholder="Doctor name" />
            <Field value={clinic} onChange={setClinic} placeholder="Clinic or hospital" />
            <div style={{ display: 'flex', gap: 10 }}>
              <label className="inp" style={{ marginTop: 10, flex: 1 }}><input className="inp-t" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="inp" style={{ marginTop: 10, flex: 1 }}><input className="inp-t" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            </div>
            <Field value={note} onChange={setNote} placeholder="Note (optional), e.g. Fasting required" />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <PillBtn tone="light" onClick={() => setForm(null)}>Cancel</PillBtn>
              <PillBtn tone="sage" disabled={title.trim().length < 2 || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</PillBtn>
            </div>
          </div>
        </div>
      )}
      {del && <Dialog title="Delete this appointment?" body={del.title} confirm="Delete" danger onCancel={() => setDel(null)} onConfirm={() => { update((s) => ({ ...s, appointments: s.appointments.filter((x) => x.id !== del.id) })); setDel(null); toast.show('Appointment deleted'); }} />}
      {toast.node}
    </>
  );
}

// ---------- Settings (26) ----------
type Panel = null | 'name' | 'language' | 'voice' | 'textsize' | 'notifs' | 'quiet';
export function Settings() {
  const nav = useNavigate();
  const { state, profile, update, resetDemo } = useStore();
  const st = state.settings;
  const [panel, setPanel] = useState<Panel>(null);
  const [signOut, setSignOut] = useState(false);
  const [reset, setReset] = useState(false);
  const [name, setName] = useState(state.onboarding.name || 'Ramesh Kumar');
  const toast = useToast();
  const set = (p: Partial<SettingsT>) => update((s) => ({ ...s, settings: { ...s.settings, ...p } }));
  const row = (icon: ReactNode, label: string, onClick: () => void, right?: ReactNode, color?: string, last?: boolean) => (
    <button key={label} data-act="1" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: last ? 0 : '1px solid #F0EBE0', background: 'none', border: 0, borderBottomStyle: 'solid', borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F0EBE0', font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', minHeight: 52 }}>
      <span style={{ color: color ?? C.muted, display: 'flex' }}>{icon}</span><span style={{ flex: 1, fontSize: 15, color: color ?? C.ink, fontWeight: color === C.plum ? 500 : 400 }}>{label}</span>{right}<Chev />
    </button>
  );
  const ic = { size: 20, strokeWidth: 1.5 } as const;
  return (
    <>
      <Screen>
        <div className="sf" style={{ fontSize: 24 }}>Settings</div>
        <button data-act="1" onClick={() => setPanel('name')} style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 16, borderBottom: `1px solid ${C.line}`, width: '100%', background: 'none', border: 0, borderBottomStyle: 'solid', borderBottomWidth: 1, borderBottomColor: C.line, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="sf" style={{ fontSize: 24, fontWeight: 500, color: C.deep }}>{(state.onboarding.name || 'R')[0]}</span></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 500 }}>{state.onboarding.name || 'Ramesh Kumar'}</div><div style={{ fontSize: 13, color: C.muted }}>+91 {state.onboarding.phone || '98765 43210'}</div></div><Chev />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {row(<Globe {...ic} />, `Language · ${st.language}`, () => setPanel('language'))}
          {row(<Mic {...ic} />, 'Voice & conversation', () => setPanel('voice'))}
          {row(<Type {...ic} />, `Text size · ${st.textSize}`, () => setPanel('textsize'))}
          {row(<Bell {...ic} />, 'Notifications & sounds', () => setPanel('notifs'), <span style={{ fontSize: 11, color: st.notificationsAllowed ? C.deep : C.terra }}>{st.notificationsAllowed ? '✓ On' : '! Off'}</span>)}
          {row(<Moon {...ic} />, 'Quiet hours', () => setPanel('quiet'), <span style={{ padding: '3px 8px', background: st.quietHours ? '#E7EDE2' : C.card, borderRadius: 999, fontSize: 11, color: st.quietHours ? C.deep : C.muted }}>{st.quietHours ? '10 PM – 7 AM' : 'Off'}</span>)}
          {row(<Users {...ic} />, 'Family permissions', () => nav('/family'), undefined, C.plum)}
          {row(<Calendar {...ic} />, 'Appointments', () => nav('/appointments'))}
          {row(<Shield {...ic} />, 'Privacy & data', () => nav('/settings/privacy'))}
          {row(<HelpCircle {...ic} />, 'Help & support', () => nav('/help'))}
          {row(<LogOut {...ic} />, 'Sign out', () => setSignOut(true), undefined, C.err, true)}
        </div>
        <SectionLabel mt={28}>Demo tools</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid #F0EBE0' }}>
            <WifiOff size={20} color={C.muted} strokeWidth={1.5} /><span style={{ flex: 1, fontSize: 15 }}>Simulate offline</span><Toggle on={!st.deviceOnline} label="Simulate offline" onChange={(v) => set({ deviceOnline: !v })} />
          </div>
          {row(<RotateCcw {...ic} />, 'Reset demo data', () => setReset(true), <DemoTag />)}
          {row(<Plus {...ic} />, 'Replay onboarding', () => { update((s) => ({ ...s, onboarding: { ...s.onboarding, done: false } })); nav('/welcome'); })}
          {row(<HelpCircle {...ic} />, 'View error states', () => nav('/errors'), undefined, undefined, true)}
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 12 }}>Viewing: {profile.name}. Data is saved on this device only.</div>
      </Screen>
      <BottomNav />
      {toast.node}

      {panel && (
        <div role="dialog" aria-modal="true" style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.35)', zIndex: 30 }} onClick={() => setPanel(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.paper, borderRadius: '24px 24px 0 0', padding: '12px 24px 32px', boxSizing: 'border-box', maxHeight: '80%', overflow: 'auto' }}>
            <div style={{ width: 36, height: 4, background: C.line, borderRadius: 2, margin: '0 auto 12px' }} />
            {panel === 'name' && (<><div className="sf" style={{ fontSize: 20 }}>Your name</div><Field value={name} onChange={setName} /><div style={{ marginTop: 16 }}><PillBtn tone="sage" disabled={name.trim().length < 2} onClick={() => { update((s) => ({ ...s, onboarding: { ...s.onboarding, name: name.trim() }, profiles: s.profiles.map((p) => (p.id === 'self' ? { ...p, name: name.trim().split(' ')[0], initial: name.trim()[0].toUpperCase() } : p)) })); setPanel(null); }}>Save</PillBtn></div></>)}
            {panel === 'language' && (<><div className="sf" style={{ fontSize: 20 }}>Language</div><Choice options={['हिन्दी', 'English', 'मराठी', 'ಕನ್ನಡ'] as const} value={st.language} onChange={(v) => set({ language: v })} /></>)}
            {panel === 'textsize' && (<><div className="sf" style={{ fontSize: 20 }}>Text size</div><Choice options={['Standard', 'Large', 'Extra'] as const} value={st.textSize} onChange={(v) => set({ textSize: v })} fs={st.textSize === 'Extra' ? 18 : 15} /></>)}
            {panel === 'voice' && (<>
              <div className="sf" style={{ fontSize: 20 }}>Voice & conversation</div>
              <Label>Speaking speed</Label><Choice options={['Normal', 'Slower'] as const} value={st.speakingSpeed} onChange={(v) => set({ speakingSpeed: v })} />
              <Label>Reminder tone</Label><Choice options={['Gentle', 'Standard'] as const} value={st.reminderTone} onChange={(v) => set({ reminderTone: v })} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}><span style={{ flex: 1, fontSize: 15 }}>Microphone allowed</span><Toggle on={st.micAllowed} label="Microphone allowed" onChange={(v) => set({ micAllowed: v })} /></div>
              <div style={{ marginTop: 20 }}><PillBtn tone="light" onClick={() => nav('/call/incoming')}>Talk to Smaran</PillBtn></div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Sathi is an AI companion, not a person. Mother and Father use a real voice session (sign in required). Your own health still uses the existing call.</div>
            </>)}
            {panel === 'notifs' && (<>
              <div className="sf" style={{ fontSize: 20 }}>Notifications & sounds</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}><span style={{ flex: 1, fontSize: 15 }}>Allow browser notifications</span><Toggle on={st.notificationsAllowed} label="Allow browser notifications" onChange={(v) => {
                if (!v) { set({ notificationsAllowed: false }); return; }
                void requestBrowserNotifications().then((ok) => {
                  set({ notificationsAllowed: ok });
                  if (!ok) toast.show(notificationsSupported() ? 'Browser blocked notifications' : 'This browser cannot show notifications');
                });
              }} /></div>
              <Label>Reminder tone</Label><Choice options={['Gentle', 'Standard'] as const} value={st.reminderTone} onChange={(v) => set({ reminderTone: v })} />
              <div style={{ fontSize: 12, color: C.faint, marginTop: 14, lineHeight: 1.45 }}>
                While Smaran is open, dose reminders appear in the app at the exact clock time you set. Browser banners appear only if you allow them here.
                If you close this tab, reminders cannot be delivered — that needs a push service Smaran has not set up.
              </div>
            </>)}
            {panel === 'quiet' && (<>
              <div className="sf" style={{ fontSize: 20 }}>Quiet hours</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}><span style={{ flex: 1, fontSize: 15 }}>10 PM – 7 AM</span><Toggle on={st.quietHours} label="Quiet hours" onChange={(v) => set({ quietHours: v })} /></div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Medicine reminders you've scheduled will still ring.</div>
            </>)}
            <div style={{ marginTop: 16 }}><TextLink color={C.muted} onClick={() => setPanel(null)}>Done</TextLink></div>
          </div>
        </div>
      )}
      {signOut && <Dialog title="Sign out?" body="You will return to DEMO DATA on this device. Your live family records stay in your Smaran account." confirm="Sign out" danger onCancel={() => setSignOut(false)} onConfirm={() => { void authSignOut().then(() => { stopSync(); resetDemo(); nav('/welcome'); }); }} />}
      {reset && <Dialog title="Reset demo data?" body="All changes you made will be replaced with the original DEMO DATA." confirm="Reset" danger onCancel={() => setReset(false)} onConfirm={() => { resetDemo(); setReset(false); toast.show('Demo data restored'); nav('/home'); }} />}
    </>
  );
}

// ---------- Privacy (44) ----------
export function Privacy() {
  const nav = useNavigate();
  const { state, update } = useStore();
  const st = state.settings;
  const [del, setDel] = useState(false);
  const set = (p: Partial<SettingsT>) => update((s) => ({ ...s, settings: { ...s.settings, ...p } }));
  const row = (title: string, sub: string, right: ReactNode, onClick?: () => void) => (
    <div key={title} role={onClick ? 'button' : undefined} data-act={onClick ? '1' : undefined} onClick={onClick} className="crd" style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: onClick ? 'pointer' : undefined }}>
      <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{sub}</div></div>{right}
    </div>
  );
  return (
    <>
      <Screen>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Privacy &amp; Data</div></div>
        <div style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>Control what Smaran stores and who can see it.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {row('Voice recordings', st.storeVoice ? 'Saved after conversations end' : 'Not stored after conversation ends', <Toggle on={st.storeVoice} label="Voice recordings" onChange={(v) => set({ storeVoice: v })} />)}
          {row('Conversation summaries', 'Short notes saved, not full transcripts', <Toggle on={st.storeSummaries} label="Conversation summaries" onChange={(v) => set({ storeSummaries: v })} />)}
          {row('Health readings', 'Stored on this device in this demo', <Chev />)}
          {row('Family access', 'Control what family members can see', <Chev />, () => nav('/family'))}
          {row('Voice cloning consent', st.voiceCloning ? 'Enabled. Sathi is always identified as AI.' : 'Not enabled', <Toggle on={st.voiceCloning} label="Voice cloning consent" onChange={(v) => set({ voiceCloning: v })} />)}
        </div>
        <div style={{ marginTop: 24 }}><PillBtn tone="danger" onClick={() => setDel(true)}>Delete all my data</PillBtn></div>
      </Screen>
      <BottomNav />
      {del && <Dialog title="Delete all your data?" body="Medicines, reminders, readings and appointments on this device will be removed. You can restore the demo from Settings." confirm="Delete" danger onCancel={() => setDel(false)} onConfirm={() => { update((s) => ({ ...s, medicines: [], events: [], readings: [], appointments: [], voiceHistory: [], changeRequests: [], extraction: null })); setDel(false); nav('/home'); }} />}
    </>
  );
}

// ---------- Help (47) ----------
const HELP: [string, string, string][] = [
  ['How to add medicines', 'Scan a prescription or add manually', 'Go to Medicines, tap +, then scan a prescription or add one yourself. You always review each medicine before reminders start.'],
  ['How Sathi calls work', "What to expect when it's medicine time", "At the scheduled time you'll get a reminder. Tap Answer to talk to Sathi, an AI companion. Whatever you tell Sathi is saved as self-reported."],
  ['Recording health readings', 'Speak or type your sugar or BP', 'Say or type a reading, check the details Smaran found, then confirm. You can edit or delete readings any time from Health.'],
  ['Family linking', 'Let someone help manage your medicines', 'Invite a family member from Family Space. Their changes only apply after you approve them.'],
];
export function Help() {
  const [open, setOpen] = useState<number | null>(null);
  const toast = useToast();
  return (
    <>
      <Screen>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Help &amp; Support</div></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {HELP.map(([t, sub, body], i) => (
            <button key={t} className="crd" data-act="1" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{t}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{sub}</div></div><ChevronRight size={16} color="#A89584" style={{ transform: open === i ? 'rotate(90deg)' : undefined }} /></div>
              {open === i && <div style={{ fontSize: 14, color: C.ink, marginTop: 10, lineHeight: 1.5 }}>{body}</div>}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: C.muted }}>Need more help?</div>
          <div style={{ marginTop: 12 }}><PillBtn tone="light" onClick={() => toast.show('Demo: support contact is not connected')}>Contact support</PillBtn></div>
        </div>
      </Screen>
      <BottomNav />
      {toast.node}
    </>
  );
}
