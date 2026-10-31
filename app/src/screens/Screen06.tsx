import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { updatePrefs } from '../store/actions'
import { store } from '../store/store'
import { Btn, Tap } from '../ui/kit'
import { registerPush } from '../services/push'
import { requestNotifications } from '../voice/speech'

export default function Screen06() {
  const { go, toast } = useApp()
  const [busy, setBusy] = useState(false)
  const allow = async () => {
    setBusy(true)
    const r = await requestNotifications()
    setBusy(false)
    updatePrefs({ permissionAsked: { ...store.get().prefs.permissionAsked, notifications: true } })
    if (r === 'granted') void registerPush()
    if (r === 'denied') toast('Notifications are blocked in your browser. You can allow them later from Settings.', 'error')
    else if (r === 'unsupported') toast("This browser can't show notifications. Reminders will appear inside the app.", 'error')
    go('07')
  }
  return (
    <div className="scr" style={{ padding: '36px 24px 100px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', height: 'calc(100% - 47px)' }}>
      <div style={{ fontSize: 13, color: '#7A6B5D' }}>1 of 2</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
        <div className="ico-c"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" /><path d="M10 20a2 2 0 004 0" /></svg></div>
        <div className="sf" style={{ fontSize: 24, textAlign: 'center', marginTop: 28, lineHeight: 1.3 }}>Let Sathi call you<br />on time.</div>
        <div style={{ fontSize: 15, color: '#7A6B5D', textAlign: 'center', marginTop: 16, lineHeight: 1.5, maxWidth: 310 }}>Smaran needs notification access so Sathi can ring you when it's time for your medicine.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <Btn onClick={allow} disabled={busy}>Allow Notifications</Btn>
        <Tap style={{ fontSize: 14, color: '#7A6B5D' }} onClick={() => go('07')}>Not now</Tap>
      </div>
    </div>
  )
}
