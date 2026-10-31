import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { User, Users, Check } from 'lucide-react';
import { useStore } from '../data/store';
import { Back, C, Choice, Field, Label, PillBtn, Screen, TextLink } from '../components/ui';
import Gen from './Gen';
import type { Settings } from '../types';
import { backendConfigured, EMAIL_RE, MIN_PASSWORD, signInEmail, signUpEmail } from '../services/backend';
import { startSync } from '../services/sync';
import { blankLiveState } from '../data/demoData';

export function Welcome() {
  const nav = useNavigate();
  const { update } = useStore();
  return (
    <Gen
      id="01"
      actions={{
        'Get Started': () => { update((s) => ({ ...s, onboarding: { ...s.onboarding, done: false } })); nav('/account'); },
        'I already have an account': () => {
          if (backendConfigured()) { nav('/account?mode=signin'); return; }
          update((s) => ({ ...s, onboarding: { ...s.onboarding, done: true } })); nav('/home');
        },
      }}
    />
  );
}

function Ring({ n, of = 5 }: { n: number; of?: number }) {
  const len = (106.8 * n) / of;
  return (
    <div style={{ width: 40, height: 40, position: 'relative' }}>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="17" fill="none" stroke={C.line} strokeWidth="3" />
        <circle cx="20" cy="20" r="17" fill="none" stroke={C.sage} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${len} 106.8`} transform="rotate(-90 20 20)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500 }}>{n}/{of}</div>
    </div>
  );
}
const Head = ({ n, title, sub }: { n: number; title: string; sub: string }) => (
  <>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Back /><Ring n={n} /></div>
    <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>{title}</div>
    <div style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>{sub}</div>
  </>
);

export function Account() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const signIn = params.get('mode') === 'signin';
  const live = backendConfigured();
  const { state, update } = useStore();
  const [name, setName] = useState(state.onboarding.name);
  const [phone, setPhone] = useState(state.onboarding.phone);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [purpose, setPurpose] = useState(state.onboarding.purpose);
  const demoOk = name.trim().length > 1 && phone.replace(/\D/g, '').length === 10;
  const liveOk = EMAIL_RE.test(email.trim()) && password.length >= MIN_PASSWORD && (signIn || demoOk);
  const ok = live ? liveOk : demoOk;
  const opt = (p: 'self' | 'parent', icon: JSX.Element, title: string, sub: string, g: string, col: string) => {
    const on = purpose === p;
    return (
      <button key={p} data-act="1" aria-pressed={on} onClick={() => setPurpose(p)} style={{ background: C.card, border: on ? `1.5px solid ${C.sage}` : `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: g, display: 'flex', alignItems: 'center', justifyContent: 'center', color: col }}>{icon}</div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div><div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{sub}</div></div>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: on ? C.sage : 'transparent', border: on ? 0 : `1.5px solid ${C.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Check size={11} color="#fff" strokeWidth={3} />}</span>
      </button>
    );
  };
  const continueDemo = () => {
    update((s) => ({ ...s, onboarding: { ...s.onboarding, name: name.trim(), phone, purpose }, profiles: s.profiles.map((p) => (p.id === 'self' ? { ...p, name: name.trim().split(' ')[0] || p.name, initial: (name.trim()[0] || p.initial).toUpperCase() } : p)) }));
    nav('/language');
  };
  const continueLive = async () => {
    setBusy(true); setError('');
    try {
      if (signIn) await signInEmail(email, password);
      else {
        await signUpEmail(email, password, name.trim());
        update(() => {
          const b = blankLiveState(name.trim());
          return { ...b, onboarding: { ...b.onboarding, name: name.trim(), phone, purpose, done: false } };
        });
      }
      await startSync();
      nav(signIn ? '/home' : '/language');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not continue.');
    } finally { setBusy(false); }
  };
  return (
    <Screen bg={C.flow} pad="20px 24px 24px" footer={<PillBtn disabled={!ok || busy} onClick={() => { if (live) void continueLive(); else continueDemo(); }}>{busy ? 'Please wait…' : signIn ? 'Sign in' : 'Continue'}</PillBtn>}>
      <Head n={1} title={signIn ? 'Sign in' : 'Create your account'} sub={live ? (signIn ? 'Use the email and password for this Smaran account.' : 'Email and password protect this family’s health data.') : "We'll use your phone number to keep your data safe."} />
      {!signIn && <><Label>Your name</Label>
      <Field value={name} onChange={setName} placeholder="Your name" /></>}
      {live && <>
        <Label>Email</Label>
        <Field value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
        <Label>Password</Label>
        <Field value={password} onChange={setPassword} placeholder="At least 8 characters" type="password" />
      </>}
      {!signIn && <>
      <Label>Phone number</Label>
      <Field focus={!live} inputMode="tel" value={phone} onChange={setPhone} placeholder="98765 43210" prefix={<><span style={{ color: C.faint, fontWeight: 500 }}>+91</span><div style={{ width: 1, height: 24, background: C.line }} /></>} />
      <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>{live ? 'Phone is for your profile only. Sign-in uses email.' : 'Demo only: no verification code is sent.'}</div>
      </>}
      {error && <div style={{ fontSize: 13, color: C.err, marginTop: 10 }}>{error}</div>}
      {live && !signIn && <div style={{ marginTop: 8 }}><TextLink onClick={() => nav('/account?mode=signin')}>I already have an account</TextLink></div>}
      {live && signIn && <div style={{ marginTop: 8 }}><TextLink onClick={() => nav('/account')}>Create an account</TextLink></div>}
      {!signIn && <>
      <div className="sep" />
      <div className="lbl" style={{ marginTop: 0 }}>Who is this for?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {opt('self', <User size={20} strokeWidth={1.5} />, 'My own health', 'Set up reminders for myself', 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', C.deep)}
        {opt('parent', <Users size={20} strokeWidth={1.5} />, 'Helping a parent', 'Set up reminders for Mummy or Papa', 'linear-gradient(135deg,#ECE4EE,#C4B0C2)', C.plum)}
      </div>
      </>}
    </Screen>
  );
}

const LANGS: [Settings['language'], string, string, string][] = [
  ['हिन्दी', 'अ', '#E8C4B5', 'Hindi'], ['English', 'A', '#E4EBEF', 'English'], ['मराठी', 'म', '#F3D6C6', 'Marathi'], ['ಕನ್ನಡ', 'ಅ', '#E8D8A5', 'Kannada'],
];
export function Language() {
  const nav = useNavigate();
  const { state, update } = useStore();
  const cur = state.settings.language;
  return (
    <Screen bg={C.flow} pad="20px 24px 24px" footer={<PillBtn onClick={() => nav('/personalize')}>Continue</PillBtn>}>
      <Head n={2} title="Choose your language" sub="Sathi will speak and show text in this language." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        {LANGS.map(([l, glyph, bg, en]) => (
          <button key={l} data-act="1" aria-pressed={cur === l} onClick={() => update((s) => ({ ...s, settings: { ...s.settings, language: l } }))} style={{ background: C.card, border: cur === l ? `1.5px solid ${C.sage}` : `1px solid ${C.line}`, borderRadius: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 14, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600 }}>{glyph}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 500 }}>{l}</div><div style={{ fontSize: 13, color: C.faint }}>{en}</div></div>
            {cur === l && <Check size={18} color={C.sage} />}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.faint, marginTop: 12, textAlign: 'center' }}>You can change this later in Settings.</div>
    </Screen>
  );
}

export function Personalize() {
  const nav = useNavigate();
  const { state, update } = useStore();
  const st = state.settings;
  const set = (p: Partial<Settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...p } }));
  return (
    <Screen bg={C.flow} pad="20px 24px 24px" footer={<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><PillBtn onClick={() => nav('/profile')}>Continue</PillBtn><TextLink color={C.muted} onClick={() => nav('/profile')}>Skip for now</TextLink></div>}>
      <Head n={3} title="Make Smaran yours" sub="All optional — skip to use defaults." />
      <Label>Text size</Label>
      <Choice options={['Standard', 'Large', 'Extra'] as const} value={st.textSize} onChange={(v) => set({ textSize: v })} fs={st.textSize === 'Extra' ? 18 : 15} />
      <Label>Speaking speed</Label>
      <Choice options={['Normal', 'Slower'] as const} value={st.speakingSpeed} onChange={(v) => set({ speakingSpeed: v })} />
      <Label>Reminder tone</Label>
      <Choice options={['Gentle', 'Standard'] as const} value={st.reminderTone} onChange={(v) => set({ reminderTone: v })} />
    </Screen>
  );
}

export function Profile() {
  const nav = useNavigate();
  const { state, update } = useStore();
  const [name, setName] = useState(state.onboarding.name || '');
  return (
    <Screen bg={C.flow} pad="20px 24px 24px" footer={<PillBtn disabled={!name.trim()} onClick={() => { update((s) => ({ ...s, onboarding: { ...s.onboarding, name: name.trim() } })); nav('/permissions/notifications'); }}>Continue</PillBtn>}>
      <Head n={4} title="About you" sub="Help Sathi know you better." />
      <Label>Your name</Label>
      <Field value={name} onChange={setName} />
      <Label>Language</Label>
      <div className="inp" style={{ marginTop: 10 }}><span style={{ flex: 1 }}>{state.settings.language}</span></div>
      <Label>Time zone</Label>
      <div className="inp" style={{ marginTop: 10 }}><span style={{ flex: 1 }}>India (IST, UTC+5:30)</span></div>
      <div className="sep" />
      <button data-act="1" onClick={() => nav('/family/invite')} style={{ width: '100%', background: C.lav, border: '1px solid #D8CEDB', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
        <Users size={22} color={C.plum} strokeWidth={1.5} />
        <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>Invite family to help</div><div style={{ fontSize: 12, color: C.plum, marginTop: 2 }}>A son or daughter can help set up medicines</div></div>
      </button>
    </Screen>
  );
}

export function PermNotifications() {
  const nav = useNavigate();
  const { update } = useStore();
  const go = (allowed: boolean) => () => { update((s) => ({ ...s, settings: { ...s.settings, notificationsAllowed: allowed } })); nav('/permissions/microphone'); };
  return <Gen id="06" actions={{ 'Allow Notifications': go(true), 'Not now': go(false) }} />;
}
export function PermMicrophone() {
  const nav = useNavigate();
  const { state, update } = useStore();
  const go = (allowed: boolean) => () => { update((s) => ({ ...s, settings: { ...s.settings, micAllowed: allowed }, onboarding: { ...s.onboarding, done: true } })); nav(state.medicines.length ? '/medicines/setup' : '/medicines/upload'); };
  return <Gen id="07" actions={{ 'Allow Microphone': go(true), 'Not now': go(false) }} />;
}

