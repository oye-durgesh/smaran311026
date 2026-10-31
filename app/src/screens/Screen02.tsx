import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { updateProfile } from '../store/actions'
import { store, useStore } from '../store/store'
import { BackBtn, Btn, CheckIcon, Err, InputBox, MicIcon, ScrollArea, StepRing, Tap, TextInput } from '../ui/kit'
import { startDictation } from '../ui/dictation'
import {
  backendConfigured, currentSession, EMAIL_RE, MIN_PASSWORD, sendPasswordReset, setNewPassword, signInEmail, signUpEmail,
} from '../services/backend'
import { startSync } from '../services/sync'

type Mode = 'signup' | 'signin' | 'forgot' | 'reset'

/**
 * Account creation with EMAIL (no phone number needed). param: "signin" (returning user), "reset" (arrived from the password-reset link).
 * With a backend configured the account lives in Supabase Auth and signup signs in immediately. Password reset still uses an email link.
 * Without a backend (local demo mode) no password is collected.
 */
export default function Screen02({ param }: { param?: string }) {
  const { go, back, toast, home } = useApp()
  const server = backendConfigured()
  const [mode, setMode] = useState<Mode>(param === 'reset' ? 'reset' : param === 'signin' ? 'signin' : 'signup')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string>()
  const profile = useStore((s) => s.profile)
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({})
  useEffect(() => { setErrors({}); setInfo(undefined) }, [mode])

  const finishSignedIn = async () => {
    await startSync()
    const s = await currentSession()
    let pending: string | null = null
    try { pending = sessionStorage.getItem('smaran:pendingInvite'); if (pending) sessionStorage.removeItem('smaran:pendingInvite') } catch { /* private mode */ }
    if (s && pending) { go('51', pending); return }
    if (s && store.get().profile.onboarded) { toast('Welcome back.', 'success'); home() } else go('03')
  }

  const next = async () => {
    const e: typeof errors = {}
    const email = profile.email.trim()
    if (mode === 'signup' && profile.name.trim().length < 2) e.name = 'Please enter your name.'
    if (mode !== 'reset' && !EMAIL_RE.test(email)) e.email = 'Enter a valid email address, for example name@example.com.'
    if (server && (mode === 'signup' || mode === 'signin' || mode === 'reset') && password.length < (mode === 'signin' ? 1 : MIN_PASSWORD)) e.password = mode === 'signin' ? 'Enter your password.' : `Choose a password of at least ${MIN_PASSWORD} characters.`
    setErrors(e)
    if (Object.keys(e).length) return
    if (!server) { go('03'); return }      // local demo mode: nothing to verify
    setBusy(true)
    try {
      if (mode === 'signup') {
        await signUpEmail(email, password, profile.name)
        await finishSignedIn()
      } else if (mode === 'signin') {
        await signInEmail(email, password); await finishSignedIn()
      } else if (mode === 'forgot') {
        await sendPasswordReset(email); setInfo('If an account exists for this email, we have sent a link to reset the password.')
      } else if (mode === 'reset') {
        await setNewPassword(password); toast('Password changed.', 'success'); setPassword(''); await finishSignedIn()
      }
    } catch (err) { setErrors({ form: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }) }
    setBusy(false)
  }
  const dictate = () => startDictation(profile.language, (t) => updateProfile({ name: t.replace(/[.,]/g, '') }), (m) => toast(m, 'error'))

  const title = mode === 'signin' ? 'Welcome back' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : 'Create your account'
  const sub = mode === 'forgot' ? "Enter your email and we'll send you a link." : mode === 'reset' ? 'Use at least 8 characters.' : "We'll use your email to keep your data safe."
  const button = mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Save new password' : 'Continue'

  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackBtn onClick={mode === 'forgot' ? () => setMode('signin') : back} />
          <StepRing step={1} total={5} />
        </div>
        <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>{sub}</div>

        <>
            {mode === 'signup' && (
              <>
                <label className="lbl" htmlFor="acc-name" style={{ display: 'block' }}>YOUR NAME</label>
                <InputBox style={{ marginTop: 10 }} invalid={!!errors.name}>
                  <TextInput id="acc-name" value={profile.name} placeholder="Your name" autoComplete="name" onChange={(e) => updateProfile({ name: e.target.value })} />
                  <Tap label="Speak your name" onClick={dictate} style={{ display: 'flex' }}><MicIcon /></Tap>
                </InputBox>
                <Err>{errors.name}</Err>
              </>
            )}
            {mode !== 'reset' && (
              <>
                <label className="lbl" htmlFor="acc-email" style={{ display: 'block' }}>EMAIL</label>
                <InputBox style={{ marginTop: 10 }} invalid={!!errors.email}>
                  <TextInput id="acc-email" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={profile.email} onChange={(e) => updateProfile({ email: e.target.value })} />
                </InputBox>
                <Err>{errors.email}</Err>
              </>
            )}
            {server && mode !== 'forgot' && (
              <>
                <label className="lbl" htmlFor="acc-password" style={{ display: 'block' }}>{mode === 'reset' ? 'NEW PASSWORD' : 'PASSWORD'}</label>
                <InputBox style={{ marginTop: 10 }} invalid={!!errors.password}>
                  <TextInput id="acc-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                </InputBox>
                <Err>{errors.password}</Err>
              </>
            )}
            <Err>{errors.form}</Err>
            {info && <div role="status" style={{ fontSize: 13, color: '#526D51', marginTop: 10, lineHeight: 1.5 }}>{info}</div>}
            {server && mode === 'signin' && <Tap style={{ marginTop: 10, fontSize: 13, color: '#7B8B5A', fontWeight: 500 }} onClick={() => setMode('forgot')}>Forgot password?</Tap>}
            {server && (mode === 'signup' || mode === 'signin') && (
              <Tap style={{ marginTop: 10, fontSize: 13, color: '#7A6B5D' }} onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'I already have an account' : 'Create a new account'}</Tap>
            )}

            {mode === 'signup' && (
              <>
                <div className="sep" />
                <div className="lbl" style={{ marginTop: 0 }}>WHO IS THIS FOR?</div>
                <div role="radiogroup" aria-label="Who is this for" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {([
                    ['self', 'My own health', 'Set up reminders for myself', 'linear-gradient(135deg,#E7EDE2,#B5C4A0)',
                      <svg key="a" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>],
                    ['parent', 'Helping a parent', 'Set up reminders for Mummy or Papa', 'linear-gradient(135deg,#ECE4EE,#C4B0C2)',
                      <svg key="b" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6F526C" strokeWidth="1.5"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" /></svg>],
                  ] as const).map(([val, ttl, s, grad, icon]) => {
                    const on = profile.role === val
                    return (
                      <Tap key={val} role="radio" aria-checked={on} onClick={() => updateProfile({ role: val })}
                        style={{ background: '#F8F4EC', border: on ? '1.5px solid #7B8B5A' : '1px solid #E8DFD1', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{ttl}</div><div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 2 }}>{s}</div></div>
                        {on
                          ? <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#7B8B5A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckIcon size={10} color="#fff" w={3} /></span>
                          : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid #8A7F6A' }} />}
                      </Tap>
                    )
                  })}
                </div>
              </>
            )}
        </>
      </ScrollArea>
      <div className="ft"><Btn onClick={() => void next()} disabled={busy}>{button}</Btn></div>
    </div>
  )
}
