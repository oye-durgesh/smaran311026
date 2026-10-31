import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { updatePrefs } from '../store/actions'
import { store } from '../store/store'
import { Btn, Tap } from '../ui/kit'
import { requestMicrophone } from '../voice/speech'

export default function Screen07() {
  const { go, toast } = useApp()
  const [busy, setBusy] = useState(false)
  const next = () => go('08')
  const allow = async () => {
    setBusy(true)
    const r = await requestMicrophone()
    setBusy(false)
    updatePrefs({ permissionAsked: { ...store.get().prefs.permissionAsked, microphone: true } })
    if (r === 'denied') toast("Microphone is blocked. You can still tap or type to reply, and allow it later in your browser's site settings.", 'error')
    else if (r === 'unsupported') toast('No microphone is available. You can tap or type instead.', 'error')
    next()
  }
  return (
    <div className="scr" style={{ padding: '36px 24px 100px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', height: 'calc(100% - 47px)' }}>
      <div style={{ fontSize: 13, color: '#7A6B5D' }}>2 of 2</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
        <div className="ico-c"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg></div>
        <div className="sf" style={{ fontSize: 24, textAlign: 'center', marginTop: 28, lineHeight: 1.3 }}>Let Sathi hear you.</div>
        <div style={{ fontSize: 15, color: '#7A6B5D', textAlign: 'center', marginTop: 16, lineHeight: 1.5, maxWidth: 310 }}>Speak naturally to confirm your medicine or answer Sathi's questions. You can always tap instead.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <Btn onClick={allow} disabled={busy}>Allow Microphone</Btn>
        <Tap style={{ fontSize: 14, color: '#7A6B5D' }} onClick={next}>Not now</Tap>
      </div>
    </div>
  )
}
