import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { updatePrefs } from '../store/actions'
import { store, useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { ScrollArea, Tap } from '../ui/kit'
import { HomeHeader } from '../ui/homeparts'
import { useNow } from '../ui/useNow'
import { notificationPermission, requestNotifications, type PermissionStatus } from '../voice/speech'
import { showSystemNotification } from '../app/scheduler'
import { registerPush } from '../services/push'

/** Notification permission status. Reflects the real browser state: denied (as designed), not yet asked, or allowed. */
export default function Screen48() {
  const { toast } = useApp()
  const now = useNow()
  useStore((s) => s.prefs)
  const [status, setStatus] = useState<PermissionStatus>(notificationPermission())
  useEffect(() => { const id = setInterval(() => setStatus(notificationPermission()), 1500); return () => clearInterval(id) }, [])

  const enable = async () => {
    if (status === 'denied') {
      toast("Notifications are blocked by your browser. Open the site settings (the lock icon in the address bar), set Notifications to Allow, then come back here.", 'error')
      return
    }
    const r = await requestNotifications()
    setStatus(r)
    updatePrefs({ permissionAsked: { ...store.get().prefs.permissionAsked, notifications: true } })
    if (r === 'granted') void registerPush()
    if (r === 'granted') toast('Notifications are on.', 'success')
    else if (r === 'denied') toast("You chose not to allow notifications. You can change this in your browser's site settings.", 'error')
  }
  const test = async () => { await showSystemNotification(`test-${Date.now()}`, 'Smaran test', 'Notifications are working.'); toast('Test notification sent.') }

  const on = status === 'granted'
  const unsupported = status === 'unsupported'
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <HomeHeader variant="namaste" now={now} />
        <div style={{ marginTop: 16, background: on ? '#E7EDE2' : 'rgba(192,133,96,.1)', border: `1px solid ${on ? '#C4D4B8' : 'rgba(192,133,96,.25)'}`, borderRadius: 14, padding: 14, display: 'flex', gap: 12 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={on ? '#526D51' : '#C08560'} strokeWidth="1.5" style={{ flexShrink: 0, marginTop: 2 }}><path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" /><path d="M10 20a2 2 0 004 0" />{!on && <path d="M1 1l22 22" />}</svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{on ? 'Notifications are on' : unsupported ? "This browser can't show notifications" : status === 'prompt' ? 'Notifications are not set up' : 'Notifications are off'}</div>
            <div style={{ fontSize: 12, color: '#7A6B5D', marginTop: 2, lineHeight: 1.4 }}>
              {on ? 'Sathi can alert you when a reminder is due, even when Smaran is in the background.'
                : unsupported ? 'Reminders will still ring inside the app while it is open.'
                : status === 'prompt' ? "Allow notifications so Sathi can remind you about medicines."
                : "Sathi can't remind you about medicines until notifications are allowed."}
            </div>
            {!on && !unsupported && <Tap onClick={enable} style={{ marginTop: 8, padding: '5px 14px', background: '#C08560', borderRadius: 999, fontSize: 13, color: '#fff', fontWeight: 500, display: 'inline-flex' }}>{status === 'denied' ? 'How to enable' : 'Allow notifications'}</Tap>}
            {on && <Tap onClick={test} style={{ marginTop: 8, padding: '5px 14px', background: '#526D51', borderRadius: 999, fontSize: 13, color: '#fff', fontWeight: 500, display: 'inline-flex' }}>Send a test</Tap>}
          </div>
        </div>
        <div style={{ marginTop: 20, fontSize: 14, color: '#7A6B5D', lineHeight: 1.5 }}>
          {on ? 'Your reminders will appear here and as notifications. A delivered notification does not mean a medicine was taken — Sathi always asks you to confirm.'
            : "Your medicines are set up, but reminders won't appear until you allow notifications. You can still check your schedule here."}
        </div>
      </ScrollArea>
      <BottomNav active="more" />
    </div>
  )
}
