import { useApp } from '../app/AppContext'
import { updatePrefs, updateProfile } from '../store/actions'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { Btn, Chip, ChevRight, ScrollArea, Tap, Toggle } from '../ui/kit'
import { SheetTitle } from '../ui/Overlays'
import { LANGS, langNative } from '../ui/options'
import { fmtHMShort } from '../domain/time'
import { speak } from '../voice/speech'
import type { Lang, TextSize } from '../domain/types'
import { supportsReplies } from '../voice/messages'
import { backendConfigured, signOut as backendSignOut } from '../services/backend'
import { stopSync } from '../services/sync'

const TEXT_LABEL: Record<TextSize, string> = { standard: 'Standard', large: 'Large', extra: 'Extra large' }
const cap = (s: string) => s

function LanguageSheet() {
  const { closeSheet, toast } = useApp()
  const lang = useStore((s) => s.profile.language)
  return (
    <div>
      <SheetTitle sub="Sathi will listen and show text in this language.">Language</SheetTitle>
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LANGS.map((l) => (
          <Tap key={l.code} role="radio" aria-checked={lang === l.code} onClick={() => { updateProfile({ language: l.code as Lang }); if (!supportsReplies(l.code)) toast('Sathi can listen in this language, but replies are in Hindi/English for now.'); closeSheet() }}
            style={{ background: '#F8F4EC', border: lang === l.code ? '1.5px solid #7B8B5A' : '1px solid #E8DFD1', borderRadius: 14, padding: '14px 16px', fontSize: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>{l.native}</span>{lang === l.code && <span style={{ color: '#526D51' }}>✓</span>}
          </Tap>
        ))}
      </div>
    </div>
  )
}
function TextSizeSheet() {
  const { closeSheet } = useApp()
  const size = useStore((s) => s.profile.textSize)
  return (
    <div>
      <SheetTitle sub="Makes text larger across the app.">Text size</SheetTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(['standard', 'large', 'extra'] as TextSize[]).map((k) => (
          <Tap key={k} role="radio" aria-checked={size === k} onClick={() => { updateProfile({ textSize: k }); closeSheet() }}
            style={{ background: '#F8F4EC', border: size === k ? '1.5px solid #7B8B5A' : '1px solid #E8DFD1', borderRadius: 14, padding: '14px 16px', fontSize: k === 'standard' ? 14 : k === 'large' ? 16 : 18, display: 'flex', justifyContent: 'space-between' }}>
            <span>{TEXT_LABEL[k]}</span>{size === k && <span style={{ color: '#526D51' }}>✓</span>}
          </Tap>
        ))}
      </div>
    </div>
  )
}
function VoiceSheet() {
  const { toast } = useApp()
  const p = useStore((s) => s.profile)
  const prefs = useStore((s) => s.prefs)
  const test = () => {
    const ok = speak('Namaste, main Sathi hoon, ek AI saathi.', 'Namaste, main Sathi hoon, ek AI saathi.', { lang: p.language, rate: p.speakingSpeed === 'slower' ? 0.8 : 1, onEnd: () => undefined, onError: () => toast("Sathi's voice could not play.", 'error') })
    if (!ok) toast("Voice playback isn't supported in this browser.", 'error')
  }
  return (
    <div>
      <SheetTitle sub="Sathi is an AI companion. These settings change how it sounds.">Voice &amp; conversation</SheetTitle>
      <div className="lbl" style={{ marginTop: 0 }}>SPEAKING SPEED</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><Chip on={p.speakingSpeed === 'normal'} onClick={() => updateProfile({ speakingSpeed: 'normal' })}>Normal</Chip><Chip on={p.speakingSpeed === 'slower'} onClick={() => updateProfile({ speakingSpeed: 'slower' })}>Slower</Chip></div>
      <div className="lbl">REMINDER TONE</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><Chip on={p.reminderTone === 'gentle'} onClick={() => updateProfile({ reminderTone: 'gentle' })}>Gentle</Chip><Chip on={p.reminderTone === 'standard'} onClick={() => updateProfile({ reminderTone: 'standard' })}>Standard</Chip></div>
      {backendConfigured() && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
            <span style={{ fontSize: 15 }}>Use Sathi's server voice</span><Toggle on={prefs.serverVoice} onChange={(v) => updatePrefs({ serverVoice: v })} label="Server voice" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <span style={{ fontSize: 15 }}>Live conversation (beta)</span><Toggle on={prefs.serverAgent} onChange={(v) => updatePrefs({ serverAgent: v })} label="Live conversation beta" />
          </div>
          <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 8, lineHeight: 1.5 }}>Server voices are AI-generated. Cloned voices are only used with your recorded consent (Privacy &amp; data).</div>
        </>
      )}
      <div style={{ marginTop: 20 }}><Btn kind="sg" onClick={test}>Hear a sample</Btn></div>
    </div>
  )
}
function QuietSheet() {
  const q = useStore((s) => s.prefs.quietHours)
  const set = (patch: Partial<typeof q>) => updatePrefs({ quietHours: { ...q, ...patch } })
  return (
    <div>
      <SheetTitle sub="During quiet hours reminders still appear, but without sound.">Quiet hours</SheetTitle>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 15 }}>Quiet hours on</span><Toggle on={q.enabled} onChange={(v) => set({ enabled: v })} label="Quiet hours" /></div>
      <div style={{ display: 'flex', gap: 12, marginTop: 16, opacity: q.enabled ? 1 : 0.5 }}>
        <div style={{ flex: 1 }}><label className="lbl" htmlFor="qh-from" style={{ display: 'block', marginTop: 0 }}>FROM</label><div className="inp" style={{ marginTop: 8 }}><input id="qh-from" className="fi" type="time" disabled={!q.enabled} value={q.from} onChange={(e) => e.target.value && set({ from: e.target.value })} /></div></div>
        <div style={{ flex: 1 }}><label className="lbl" htmlFor="qh-to" style={{ display: 'block', marginTop: 0 }}>UNTIL</label><div className="inp" style={{ marginTop: 8 }}><input id="qh-to" className="fi" type="time" disabled={!q.enabled} value={q.to} onChange={(e) => e.target.value && set({ to: e.target.value })} /></div></div>
      </div>
      <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 12, lineHeight: 1.5 }}>Medicine reminders are never skipped — only the sound is muted.</div>
    </div>
  )
}

export default function Screen26() {
  const { go, openSheet, confirm, toast } = useApp()
  const p = useStore((s) => s.profile)
  const q = useStore((s) => s.prefs.quietHours)
  const row = (icon: React.ReactNode, label: string, on: () => void, opts: { color?: string; weight?: number; right?: React.ReactNode; chev?: boolean; last?: boolean } = {}) => (
    <Tap onClick={on} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', ...(opts.last ? {} : { borderBottom: '1px solid #F0EBE0' }) }}>
      {icon}<span style={{ flex: 1, fontSize: 15, color: opts.color, fontWeight: opts.weight }}>{label}</span>{opts.right}{opts.chev !== false && <ChevRight />}
    </Tap>
  )
  const svg = (stroke: string, d: React.ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">{d}</svg>
  const signOut = () => confirm({
    title: 'Sign out?', message: backendConfigured() ? 'You will need to sign in again.' : 'Your data stays on this device. You can come back by choosing "I already have an account".',
    confirmLabel: 'Sign out', danger: true,
    onConfirm: () => { void backendSignOut().finally(() => { stopSync(); updateProfile({ signedIn: false }); toast('Signed out.'); window.location.hash = '#01' }) },
  })
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <div className="sf" style={{ fontSize: 24 }}>Settings</div>
        <Tap onClick={() => go('05')} style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 16, borderBottom: '1px solid #E8DFD1' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="sf" style={{ fontSize: 24, fontWeight: 500, color: '#526D51' }}>{(p.name.trim()[0] ?? 'S').toUpperCase()}</span></div>
          <div><div style={{ fontSize: 17, fontWeight: 500 }}>{p.name || 'Add your name'}</div><div style={{ fontSize: 13, color: '#7A6B5D' }}>{p.phone ? `+91 ${p.phone.replace(/(\d{5})(\d+)/, '$1 $2')}` : 'No phone number'}</div></div>
          <span style={{ marginLeft: 'auto' }}><ChevRight /></span>
        </Tap>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {row(svg('#2E241B', <><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></>), `Language · ${langNative(p.language)}`, () => openSheet(<LanguageSheet />))}
          {row(svg('#2E241B', <><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" /></>), 'Voice & conversation', () => openSheet(<VoiceSheet />))}
          {row(svg('#2E241B', <path d="M4 6h16M4 10h16M4 14h10M4 18h6" />), `Text size · ${cap(TEXT_LABEL[p.textSize]).replace(' large', '')}`, () => openSheet(<TextSizeSheet />))}
          {row(svg('#2E241B', <><path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" /><path d="M10 20a2 2 0 004 0" /></>), 'Notifications & sounds', () => go('48'))}
          {row(svg('#2E241B', <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>), 'Quiet hours', () => openSheet(<QuietSheet />), { right: <div style={{ padding: '3px 8px', background: q.enabled ? '#E7EDE2' : '#F8F4EC', borderRadius: 999, fontSize: 11, color: q.enabled ? '#526D51' : '#7A6B5D' }}>{q.enabled ? `${fmtHMShort(q.from)} – ${fmtHMShort(q.to)}` : 'Off'}</div> })}
          {row(svg('#6F526C', <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" /></>), 'Family permissions', () => go('41', 'defaults'), { color: '#6F526C', weight: 500 })}
          {row(svg('#2E241B', <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></>), 'Privacy & data', () => go('44'))}
          {row(svg('#2E241B', <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>), 'Help & support', () => go('47'))}
          {row(svg('#B75B53', <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />), 'Sign out', signOut, { color: '#B75B53', chev: false, last: true })}
        </div>
      </ScrollArea>
      <BottomNav active="more" />
    </div>
  )
}
