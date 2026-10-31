import { useState, type CSSProperties } from 'react'
import { useApp } from '../app/AppContext'
import { updateProfile } from '../store/actions'
import { useStore } from '../store/store'
import { BackBtn, Btn, Chip, Err, InputBox, ScrollArea, StepRing, Tap, TextInput } from '../ui/kit'
import { speak } from '../voice/speech'
import { initialState } from '../store/defaults'

const tile = (on: boolean, size: number): CSSProperties => ({
  flex: 1, height: 48, background: '#F8F4EC', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size,
  ...(on ? { border: '1.5px solid #7B8B5A', fontWeight: 500 } : { border: '1px solid #E8DFD1', color: '#7A6B5D' }),
})
const PRESETS = ['Mummy', 'Papa', 'Dadi', 'Dada']

export default function Screen04() {
  const { go, back } = useApp()
  const p = useStore((s) => s.profile)
  const isCustom = !PRESETS.includes(p.callName)
  const [custom, setCustom] = useState(isCustom)
  const [err, setErr] = useState<string>()

  const next = () => {
    if (!p.callName.trim()) { setErr('Please choose or type what Sathi should call you.'); return }
    go('05')
  }
  const skip = () => {
    const d = initialState().profile
    updateProfile({ textSize: d.textSize, speakingSpeed: d.speakingSpeed, reminderTone: d.reminderTone, callName: d.callName })
    go('05')
  }
  const preview = (speed: 'normal' | 'slower') => {
    updateProfile({ speakingSpeed: speed })
    speak('Namaste, main Sathi hoon.', 'Namaste, main Sathi hoon.', { lang: p.language, rate: speed === 'slower' ? 0.8 : 1, onEnd: () => undefined, onError: () => undefined })
  }
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackBtn onClick={back} />
          <StepRing step={3} total={5} />
        </div>
        <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>Make Smaran yours</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>All optional — skip to use defaults.</div>
        <div className="lbl">TEXT SIZE</div>
        <div role="radiogroup" aria-label="Text size" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Tap role="radio" aria-checked={p.textSize === 'standard'} style={tile(p.textSize === 'standard', 14)} onClick={() => updateProfile({ textSize: 'standard' })}>Standard</Tap>
          <Tap role="radio" aria-checked={p.textSize === 'large'} style={tile(p.textSize === 'large', 16)} onClick={() => updateProfile({ textSize: 'large' })}>Large</Tap>
          <Tap role="radio" aria-checked={p.textSize === 'extra'} style={tile(p.textSize === 'extra', 18)} onClick={() => updateProfile({ textSize: 'extra' })}>Extra</Tap>
        </div>
        <div className="lbl">SPEAKING SPEED</div>
        <div role="radiogroup" aria-label="Speaking speed" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Tap role="radio" aria-checked={p.speakingSpeed === 'normal'} style={tile(p.speakingSpeed === 'normal', 14)} onClick={() => preview('normal')}>Normal</Tap>
          <Tap role="radio" aria-checked={p.speakingSpeed === 'slower'} style={tile(p.speakingSpeed === 'slower', 14)} onClick={() => preview('slower')}>Slower</Tap>
        </div>
        <div className="lbl">REMINDER TONE</div>
        <div role="radiogroup" aria-label="Reminder tone" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Tap role="radio" aria-checked={p.reminderTone === 'gentle'} style={tile(p.reminderTone === 'gentle', 14)} onClick={() => updateProfile({ reminderTone: 'gentle' })}>Gentle</Tap>
          <Tap role="radio" aria-checked={p.reminderTone === 'standard'} style={tile(p.reminderTone === 'standard', 14)} onClick={() => updateProfile({ reminderTone: 'standard' })}>Standard</Tap>
        </div>
        <div className="lbl">SATHI CALLS YOU</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {PRESETS.map((n) => <Chip key={n} on={!custom && p.callName === n} onClick={() => { setCustom(false); setErr(undefined); updateProfile({ callName: n }) }}>{n}</Chip>)}
          <Chip on={custom} dashed={!custom} onClick={() => { setCustom(true); if (PRESETS.includes(p.callName)) updateProfile({ callName: '' }) }}>Custom</Chip>
        </div>
        {custom && (
          <InputBox style={{ marginTop: 10 }} invalid={!!err}>
            <TextInput aria-label="What should Sathi call you?" autoFocus maxLength={24} value={p.callName} placeholder="Type a name" onChange={(e) => { setErr(undefined); updateProfile({ callName: e.target.value }) }} />
          </InputBox>
        )}
        <Err>{err}</Err>
        <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 8 }}>Sathi will say "Namaste, {p.callName || '…'}" when calling.</div>
      </ScrollArea>
      <div className="ft"><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}><Btn onClick={next}>Continue</Btn><Tap style={{ fontSize: 14, color: '#7A6B5D' }} onClick={skip}>Skip for now</Tap></div></div>
    </div>
  )
}
