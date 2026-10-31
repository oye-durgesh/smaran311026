import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { BackBtn, MicIcon, ScrollArea, Tap } from './kit'

/** Visual states of voice capture on the Health screen. */
export type CapturePhase = 'ready' | 'listening' | 'confirm' | 'failed'

const PLUM = '#6F526C'
const Bars = () => (
  <div aria-hidden style={{ display: 'flex', gap: 4, alignItems: 'center', height: 28 }}>
    {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} style={{ width: 3, height: 10 + ((i * 5) % 14), background: PLUM, borderRadius: 2, animation: `s-wave ${0.7 + (i % 3) * 0.1}s ${i * 0.07}s ease-in-out infinite` }} />)}
  </div>
)

/**
 * Voice capture for readings — interface only. No microphone, speech-recognition or voice API is used here.
 * A provider plugs in through the props: call `onListening` when capture starts and set the phase
 * (`confirm` with a parsed reading, or `failed`) when it ends.
 */
export function VoiceCapture({ onPhase }: { onPhase?: (p: CapturePhase) => void }) {
  const [phase, setPhaseState] = useState<CapturePhase>('ready')
  const setPhase = (p: CapturePhase) => { setPhaseState(p); onPhase?.(p) }
  const { go, toast } = useApp()

  if (phase === 'confirm' || phase === 'failed') {
    return (
      <div role="dialog" aria-label={phase === 'confirm' ? 'Confirm reading' : 'Record reading'} style={{ position: 'absolute', inset: 0, background: '#F0EAE0', zIndex: 6, animation: 'float-up .25s ease-out' }}>
        <ScrollArea style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '20px 24px 120px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <BackBtn onClick={() => setPhase('ready')} />
            <div className="sf" style={{ fontSize: 22 }}>{phase === 'confirm' ? 'Confirm Reading' : 'Record Reading'}</div>
          </div>
          {phase === 'confirm' ? <Confirm /> : <Failed onTry={() => setPhase('listening')} onSugar={() => go('21')} onBp={() => go('22')} />}
        </ScrollArea>
        {phase === 'confirm' && (
          <div className="ft" style={{ display: 'flex', gap: 12 }}>
            <Tap onClick={() => setPhase('failed')} style={{ flex: 1, height: 52, borderRadius: 999, background: '#fff', border: '1px solid #E8DFD1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Edit</Tap>
            <Tap onClick={() => { toast('Preview only — nothing was saved.', 'info'); setPhase('ready') }} style={{ flex: 2, height: 52, borderRadius: 999, background: '#526D51', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Confirm &amp; Save</Tap>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {phase === 'listening' && <div aria-hidden onClick={() => setPhase('ready')} style={{ position: 'absolute', inset: 0, background: 'rgba(240,234,224,.6)', zIndex: 4 }} />}
      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 84, zIndex: 5, animation: 'float-up .25s ease-out' }}>
        {phase === 'ready' ? (
          <Tap onClick={() => setPhase('listening')} label="Voice input. Tap to start" style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1.5px solid ${PLUM}`, borderRadius: 18, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(111,82,108,.2)', textAlign: 'left' }}>
            <span style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,#8B6B88,#6F526C)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MicIcon size={18} color="#fff" /></span>
            <span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>Voice input</span><span style={{ display: 'block', fontSize: 12, color: '#7A6B5D', marginTop: 2 }}>Say a reading, then confirm it</span></span>
          </Tap>
        ) : (
          <div role="status" style={{ background: '#fff', border: `1.5px solid ${PLUM}`, borderRadius: 20, padding: '14px 14px 14px 16px', display: 'flex', alignItems: 'center', gap: 12, animation: 'vc-glow 2s ease-in-out infinite' }}>
            <span style={{ position: 'relative', width: 44, height: 44, borderRadius: '50%', background: PLUM, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${PLUM}`, animation: 's-pulse 1.5s ease-out infinite' }} />
              <MicIcon size={20} color="#fff" />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, color: PLUM, fontWeight: 500 }}>Listening…</span>
              <span style={{ display: 'block', fontSize: 12, color: '#7A6B5D', marginTop: 2 }}>Preview — voice capture is not connected</span>
              <span style={{ display: 'block', marginTop: 6 }}><Bars /></span>
            </span>
            <Tap label="Stop" onClick={() => setPhase('failed')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(183,91,83,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B75B53" strokeWidth="2.2"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </Tap>
          </div>
        )}
        {phase === 'ready' && <PreviewStrip onPick={setPhase} />}
      </div>
    </>
  )
}

function PreviewStrip({ onPick }: { onPick: (p: CapturePhase) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', marginTop: 8, fontSize: 11, color: '#8A7F6A' }}>
      <span>Preview states:</span>
      {(['listening', 'confirm', 'failed'] as const).map((p) => (
        <button key={p} type="button" onClick={() => onPick(p)} style={{ minHeight: 32, padding: '0 10px', borderRadius: 999, border: '1px solid #D8CEDB', background: '#fff', color: PLUM, fontSize: 11, cursor: 'pointer', textTransform: 'capitalize' }}>{p}</button>
      ))}
    </div>
  )
}

const Row = ({ k, children, last }: { k: string; children: ReactNode; last?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: last ? 0 : '1px solid #C4D4B8' }}><span style={{ fontSize: 13, color: '#7A6B5D' }}>{k}</span><span style={{ fontWeight: 500 }}>{children}</span></div>
)

function Confirm() {
  return (
    <>
      <div className="lbl" style={{ marginTop: 24 }}>WHAT YOU SAID</div>
      <div style={{ marginTop: 10, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: '14px 16px', fontSize: 15, lineHeight: 1.5 }}>“Mera sugar aaj 180 aaya, breakfast se pehle”<div style={{ fontSize: 11, color: '#8A7F6A', marginTop: 8 }}>Sample text for the preview</div></div>
      <div className="lbl">EXTRACTED READING</div>
      <div style={{ marginTop: 10, background: '#E7EDE2', border: '1px solid #C4D4B8', borderRadius: 14, padding: '4px 16px' }}>
        <Row k="Type">Blood Sugar</Row>
        <Row k="Value"><span style={{ fontSize: 22 }}>180</span> <span style={{ fontSize: 13, color: '#7A6B5D', fontWeight: 400 }}>mg/dL</span></Row>
        <Row k="Context">Before breakfast</Row>
        <Row k="Date &amp; time" last>Today</Row>
      </div>
      <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 14, textAlign: 'center' }}>Does this look correct?</div>
    </>
  )
}

function Failed({ onTry, onSugar, onBp }: { onTry: () => void; onSugar: () => void; onBp: () => void }) {
  return (
    <>
      <div style={{ marginTop: 24, background: 'rgba(192,133,96,.1)', border: '1px solid rgba(192,133,96,.25)', borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>Couldn’t detect a reading</div>
        <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 4, lineHeight: 1.45 }}>Try saying it again, or enter it yourself.</div>
      </div>
      <div className="lbl">ENTER MANUALLY</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <Tap onClick={onSugar} style={{ flex: 1, height: 52, borderRadius: 999, background: '#2E241B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500 }}>Blood Sugar</Tap>
        <Tap onClick={onBp} style={{ flex: 1, height: 52, borderRadius: 999, background: '#fff', border: '1px solid #E8DFD1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500 }}>Blood Pressure</Tap>
      </div>
      <Tap onClick={onTry} style={{ marginTop: 14, height: 52, borderRadius: 999, background: '#ECE4EE', color: PLUM, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 500 }}><MicIcon size={18} color={PLUM} />Try again</Tap>
    </>
  )
}
