import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Tap, WaveIcon } from './kit'
import { voice, type VoiceSnapshot } from '../voice/session'

export const CALL_BG = 'radial-gradient(ellipse 100% 60% at 50% 20%,#B87D5A 0%,#7A6B7E 45%,#2A2530 85%)'

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
export const providerLabel = () => 'AI companion · demo voice (your browser)'

export function Avatar({ size, icon, style, children }: { size: number; icon: number; style?: React.CSSProperties; children?: ReactNode }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#E8DFD1,#B87D5A)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      {children}<WaveIcon size={icon} color="#fff" />
    </div>
  )
}

export function Wave({ gap = 4, h = 32, mt = 16 }: { gap?: number; h?: number; mt?: number }) {
  const bars: Array<[number, string]> = [[14, ''], [24, '.1s '], [18, '.2s '], [28, '.3s '], [12, '.4s ']]
  return (
    <div aria-hidden style={{ display: 'flex', gap, alignItems: 'center', marginTop: mt, height: h }}>
      {bars.map(([bh, d], i) => <span key={i} style={{ width: 3, height: bh, background: '#fff', borderRadius: 2, animation: `s-wave .8s ${d}ease-in-out infinite` }} />)}
    </div>
  )
}

export function CtrlBtn({ label, on, bg, onClick, children, dim }: { label: string; on?: boolean; bg?: string; onClick: () => void; children: ReactNode; dim?: boolean }) {
  return (
    <Tap label={label} aria-pressed={on} onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: dim ? 0.55 : 1 }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: bg ?? (on ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.12)'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
      <div style={{ fontSize: 10, color: 'rgba(245,239,230,.7)' }}>{label}</div>
    </Tap>
  )
}
export const MuteIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></svg>
export const RepeatIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /></svg>
export const EndIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" transform="rotate(135)"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></svg>

export function CallControls({ v, repeat }: { v: VoiceSnapshot; repeat?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 40, padding: '0 0 12px' }}>
      <CtrlBtn label={v.muted ? 'Unmute' : 'Mute'} on={v.muted} onClick={() => voice.toggleMute()}><MuteIcon /></CtrlBtn>
      {repeat && <CtrlBtn label="Repeat" onClick={() => voice.repeat()}><RepeatIcon /></CtrlBtn>}
      <CtrlBtn label="End" bg="#B75B53" onClick={() => voice.end()}><EndIcon /></CtrlBtn>
    </div>
  )
}

/** Text fallback: always available, so reminders and readings stay testable without a microphone. */
export function TextBar({ v }: { v: VoiceSnapshot }) {
  const [t, setT] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (v.textMode) ref.current?.focus() }, [v.textMode])
  if (!v.textMode) {
    return <Tap onClick={() => voice.useText()} style={{ fontSize: 13, color: 'rgba(245,239,230,.8)', textDecoration: 'underline', padding: '6px 0 14px' }}>Type instead</Tap>
  }
  const send = () => { if (t.trim()) { voice.handleUserText(t); setT('') } }
  return (
    <form onSubmit={(e) => { e.preventDefault(); send() }} style={{ display: 'flex', gap: 8, width: '100%', paddingBottom: 12 }}>
      <input ref={ref} value={t} onChange={(e) => setT(e.target.value)} aria-label="Type your reply" placeholder="Type your reply…" disabled={v.state === 'processing' || v.state === 'speaking'}
        style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 999, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.12)', color: '#fff', padding: '0 16px', fontSize: 15, outline: 'none' }} />
      <button type="submit" aria-label="Send" style={{ width: 44, height: 44, borderRadius: '50%', border: 0, background: '#7A9B6B', color: '#fff', fontSize: 18, cursor: 'pointer' }}>↑</button>
    </form>
  )
}
