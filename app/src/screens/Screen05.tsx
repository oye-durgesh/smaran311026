import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { setActivePerson, updateProfile } from '../store/actions'
import { store, useStore } from '../store/store'
import { selfOf } from '../domain/people'
import { BackBtn, Btn, ChevDown, ChevRight, Err, InputBox, ScrollArea, StepRing, Tap, TextInput } from '../ui/kit'
import { LANGS, tzLabel, tzOptions } from '../ui/options'
import type { Lang } from '../domain/types'

export default function Screen05() {
  const { go, back } = useApp()
  const p = useStore((s) => s.profile)
  const [errors, setErrors] = useState<{ name?: string; callName?: string }>({})

  const next = () => {
    const e: typeof errors = {}
    if (p.name.trim().length < 2) e.name = 'Please enter your name.'
    if (!p.callName.trim()) e.callName = 'Please enter what Sathi should call you.'
    setErrors(e)
    if (Object.keys(e).length) return
    if (p.role === 'parent') { go('49'); return } // choose or add the parent first; onboarding completes there
    setActivePerson(selfOf(store.get())!.id) // "My own health": the account holder's own profile
    updateProfile({ onboarded: true, signedIn: true })
    go('06')
  }
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackBtn onClick={back} />
          <StepRing step={4} total={5} />
        </div>
        <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>About you</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>Help Sathi know you better.</div>
        <label className="lbl" htmlFor="pf-name" style={{ display: 'block' }}>YOUR NAME</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.name}><TextInput id="pf-name" value={p.name} onChange={(e) => updateProfile({ name: e.target.value })} /></InputBox>
        <Err>{errors.name}</Err>
        <label className="lbl" htmlFor="pf-call" style={{ display: 'block' }}>SATHI CALLS YOU</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.callName}><TextInput id="pf-call" value={p.callName} maxLength={24} onChange={(e) => updateProfile({ callName: e.target.value })} /></InputBox>
        <Err>{errors.callName}</Err>
        <label className="lbl" htmlFor="pf-lang" style={{ display: 'block' }}>LANGUAGE</label>
        <InputBox style={{ marginTop: 10 }}>
          <select id="pf-lang" className="fi" value={p.language} onChange={(e) => updateProfile({ language: e.target.value as Lang })}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
          <ChevDown />
        </InputBox>
        <label className="lbl" htmlFor="pf-tz" style={{ display: 'block' }}>TIME ZONE</label>
        <InputBox style={{ marginTop: 10 }}>
          <select id="pf-tz" className="fi" value={p.timeZone} onChange={(e) => updateProfile({ timeZone: e.target.value })}>
            {tzOptions(p.timeZone).map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}
          </select>
          <ChevDown />
        </InputBox>
        <div className="sep" />
        <Tap onClick={() => go('24')} style={{ background: '#ECE4EE', border: '1px solid #D8CEDB', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6F526C" strokeWidth="1.5"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" /></svg>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>Invite family to help</div><div style={{ fontSize: 12, color: '#6F526C', marginTop: 2 }}>A son or daughter can help set up medicines</div></div>
          <ChevRight color="#6F526C" />
        </Tap>
      </ScrollArea>
      <div className="ft"><Btn onClick={next}>Continue</Btn></div>
    </div>
  )
}
