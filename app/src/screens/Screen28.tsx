import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { store, useStore } from '../store/store'
import { BackBtn, Tap } from '../ui/kit'
import { requestMicrophone } from '../voice/speech'
import { voice } from '../voice/session'
import { updatePrefs } from '../store/actions'

export default function Screen28() {
  const { go, back, toast } = useApp()
  const err = useStore((s) => s.setup.extraction?.error)
  const code = useStore((s) => s.setup.extraction?.errorCode)
  const rawText = useStore((s) => s.setup.extraction?.rawText)
  const noRetry = code === 'missing_credentials' || code === 'unsupported_type' || code === 'invalid_file' || code === 'too_large' || code === 'too_many_pages' || code === 'auth' || code === 'billing'
  const [showText, setShowText] = useState(false)
  const rx = useStore((s) => s.setup.prescription)
  const retry = () => (rx ? go('09') : go('08'))
  const mic = async () => {
    const r = await requestMicrophone()
    updatePrefs({ permissionAsked: { ...store.get().prefs.permissionAsked, microphone: true } })
    toast(r === 'granted' ? 'Microphone allowed.' : r === 'denied' ? "Microphone is blocked. Allow it in your browser's site settings, or reply by tapping or typing." : 'No microphone is available on this device.', r === 'granted' ? 'success' : 'error')
  }
  const row = (icon: React.ReactNode, text: string, on: () => void) => (
    <Tap onClick={on} style={{ background: '#fff', border: '1px solid #E8DFD1', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}<span style={{ color: '#7A6B5D' }}>{text}</span>
    </Tap>
  )
  return (
    <div className="scr" style={{ padding: '20px 24px', boxSizing: 'border-box', overflow: 'auto', height: 'calc(100% - 47px)' }}>
      <BackBtn onClick={back} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 16px' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(183,91,83,.08)', border: '1px solid rgba(183,91,83,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#B75B53" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
        </div>
        <div className="sf" style={{ fontSize: 20, marginTop: 20 }}>Couldn't read prescription</div>
        <div style={{ fontSize: 14, color: '#7A6B5D', marginTop: 8, lineHeight: 1.5 }}>
          {err ? `${err} ` : 'The image was too blurry or the text couldn\'t be recognized. '}{noRetry ? 'You can add medicines manually.' : 'Try taking a clearer photo or add medicines manually.'}
        </div>
        {rawText && (
          <Tap onClick={() => setShowText((v) => !v)} style={{ marginTop: 12, fontSize: 13, color: '#7A6B5D', textDecoration: 'underline' }}>{showText ? 'Hide' : 'Show'} the text we read</Tap>
        )}
        {rawText && showText && <pre style={{ marginTop: 8, textAlign: 'left', whiteSpace: 'pre-wrap', fontSize: 12, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 10, padding: 10, maxHeight: 180, overflow: 'auto', width: '100%', boxSizing: 'border-box' }}>{rawText}</pre>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 24 }}>
          {!noRetry && <Tap onClick={retry} style={{ height: 48, background: '#2E241B', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F5EFE6', fontSize: 15, fontWeight: 500 }}>Try again</Tap>}
          <Tap onClick={() => go('31')} style={{ height: 48, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Add manually</Tap>
        </div>
      </div>
      <div className="sep" />
      <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>Other error states</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, fontSize: 13 }}>
        {row(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B75B53" strokeWidth="1.5"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" /></svg>,
          'Device offline — changes saved locally', () => toast(navigator.onLine ? 'You are online. Changes are always saved on this device first.' : 'You are offline. Changes are saved on this device.', 'info'))}
        {row(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C08560" strokeWidth="1.5"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /><path d="M1 1l22 22" /></svg>,
          'Mic denied — tap-to-respond available', () => void mic())}
        {row(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C08560" strokeWidth="1.5"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /><path d="M1 1l22 22" /></svg>,
          'Call failed — retry or text response', () => { voice.startAssistant(); go('34') })}
        {row(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C08560" strokeWidth="1.5"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>,
          'Sync pending — waiting for parent', () => go('24'))}
      </div>
    </div>
  )
}
