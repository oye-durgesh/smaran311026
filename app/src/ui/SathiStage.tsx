import type { ReactNode } from 'react'
import { MicIcon, Tap, WaveIcon } from './kit'
import { CALL_BG, MuteIcon, EndIcon, mmss } from './callparts'

/** The six visual states of the Sathi voice screen. Purely visual: nothing here plays, records or connects. */
export type StageState = 'ready' | 'listening' | 'processing' | 'speaking' | 'muted' | 'disconnected'

export const STAGE_STATES: Array<{ id: StageState; label: string }> = [
  { id: 'ready', label: 'Ready' }, { id: 'listening', label: 'Listening' }, { id: 'processing', label: 'Processing' },
  { id: 'speaking', label: 'Speaking' }, { id: 'muted', label: 'Muted' }, { id: 'disconnected', label: 'Disconnected' },
]

const STATUS: Record<StageState, { title: string; sub: string; color: string }> = {
  ready: { title: 'Ready', sub: 'Tap the microphone to talk to Sathi', color: 'rgba(245,239,230,.9)' },
  listening: { title: 'Listening…', sub: 'Speak naturally', color: '#7A9B6B' },
  processing: { title: 'Thinking…', sub: 'One moment', color: 'rgba(245,239,230,.9)' },
  speaking: { title: 'Speaking…', sub: '', color: 'rgba(245,239,230,.9)' },
  muted: { title: 'Muted', sub: 'Sathi cannot hear you. Tap Unmute to talk', color: '#E8C9A8' },
  disconnected: { title: 'Disconnected', sub: 'Sathi is not connected right now', color: '#F0B8B2' },
}

export function Orb({ size, state }: { size: number; state: StageState }) {
  const rings = state === 'speaking' ? ['ring1', 'ring2', 'ring3'] : state === 'listening' ? ['ring1'] : []
  const dim = state === 'disconnected' || state === 'muted'
  return (
    <div aria-hidden style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.55 : 1, transition: 'opacity .3s' }}>
      {rings.map((r, i) => <span key={r} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1.5px solid ${state === 'listening' ? 'rgba(122,155,107,.5)' : 'rgba(255,255,255,.35)'}`, animation: `${r} ${2 + i * 0.3}s ease-out infinite` }} />)}
      <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#E8DFD1,#B87D5A)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: state === 'listening' ? 'orb-listen 2.4s ease-in-out infinite' : state === 'disconnected' || state === 'muted' ? 'none' : 'orb-breathe 3s ease-in-out infinite', transition: 'all .3s' }}>
        <WaveIcon size={Math.round(size * 0.42)} color="#fff" />
      </div>
    </div>
  )
}

function Bars({ n, h }: { n: number; h: number }) {
  return (
    <div aria-hidden style={{ display: 'flex', gap: 5, alignItems: 'center', height: h }}>
      {Array.from({ length: n }, (_, i) => <span key={i} style={{ width: 3, height: 10 + ((i * 7) % 14), background: '#fff', borderRadius: 2, animation: `s-wave ${0.7 + (i % 3) * 0.12}s ${i * 0.08}s ease-in-out infinite` }} />)}
    </div>
  )
}

/**
 * The immersive Sathi screen. It renders `state` and calls back; it never produces sound.
 * Integration points for a future voice provider: drive `state`, `caption` and `seconds` from the
 * provider's events and handle `onMic` / `onMute` / `onEnd`.
 */
export function SathiStage({ state, caption, seconds, subtitle, onMic, onMute, onEnd, notice, extra, controls = true }: {
  state: StageState
  caption?: string
  seconds?: number
  subtitle?: string
  onMic?: () => void
  onMute?: () => void
  onEnd?: () => void
  notice?: ReactNode
  extra?: ReactNode
  controls?: boolean
}) {
  const st = STATUS[state]
  return (
    <div className="scr" data-sathi-state={state}>
      <div style={{ position: 'absolute', inset: 0, background: CALL_BG }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', padding: '28px 24px 24px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12, color: 'rgba(245,239,230,.6)', letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: 6, minHeight: 16 }}>
          {seconds != null && <><span style={{ width: 6, height: 6, borderRadius: '50%', background: state === 'disconnected' ? '#B75B53' : '#7A9B6B' }} />{mmss(seconds)}</>}
        </div>
        <div style={{ marginTop: 28 }}><Orb size={140} state={state} /></div>
        <div className="sf" style={{ fontSize: 26, color: '#fff', marginTop: 20 }}>Sathi</div>
        <div style={{ fontSize: 13, color: 'rgba(245,239,230,.6)', marginTop: 4 }}>{subtitle ?? 'Your health companion'}</div>

        <div role="status" aria-live="polite" style={{ marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 96, gap: 8 }}>
          {state === 'processing' && <div aria-hidden style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
          {state === 'speaking' && <Bars n={6} h={32} />}
          {state === 'listening' && <div aria-hidden style={{ width: 56, height: 56, borderRadius: '50%', border: '3px solid rgba(122,155,107,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'orb-listen 2s ease-in-out infinite' }}><MicIcon size={26} color="#7A9B6B" /></div>}
          <div style={{ fontSize: 18, fontWeight: 500, color: st.color }}>{st.title}</div>
          {(caption || st.sub) && <div style={{ fontSize: 14, color: 'rgba(245,239,230,.75)', textAlign: 'center', maxWidth: 290, lineHeight: 1.45, animation: 'float-up .3s ease-out' }}>{caption || st.sub}</div>}
        </div>

        {notice && <div style={{ marginTop: 16, width: '100%', maxWidth: 320 }}>{notice}</div>}
        <div style={{ flex: 1 }} />
        {extra}
        {controls && (
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', paddingTop: 8 }}>
            <Ctl label={state === 'muted' ? 'Unmute' : 'Mute'} on={state === 'muted'} onClick={onMute} disabled={state === 'disconnected'}><MuteIcon /></Ctl>
            <Ctl label={state === 'listening' ? 'Stop' : 'Talk'} bg="#7A9B6B" size={64} onClick={onMic} disabled={state === 'disconnected' || state === 'muted'}><MicIcon size={28} color="#fff" /></Ctl>
            <Ctl label="End" bg="#B75B53" onClick={onEnd}><EndIcon /></Ctl>
          </div>
        )}
      </div>
    </div>
  )
}

function Ctl({ label, on, bg, size = 52, onClick, disabled, children }: { label: string; on?: boolean; bg?: string; size?: number; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tap label={label} aria-pressed={on} onClick={disabled ? undefined : onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: disabled ? 0.4 : 1, minWidth: 56 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg ?? (on ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.14)'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
      <div style={{ fontSize: 11, color: 'rgba(245,239,230,.75)' }}>{label}</div>
    </Tap>
  )
}

/** Developer/design preview strip: lets every state be seen without a live connection. */
export function StatePreview({ value, onChange }: { value: StageState; onChange: (s: StageState) => void }) {
  return (
    <div style={{ width: '100%', marginBottom: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'rgba(245,239,230,.55)', textAlign: 'center', marginBottom: 6 }}>PREVIEW STATE · VOICE NOT CONNECTED</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {STAGE_STATES.map((s) => (
          <button key={s.id} type="button" aria-pressed={value === s.id} onClick={() => onChange(s.id)}
            style={{ minHeight: 32, padding: '0 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,.25)', background: value === s.id ? 'rgba(255,255,255,.28)' : 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer' }}>{s.label}</button>
        ))}
      </div>
    </div>
  )
}
