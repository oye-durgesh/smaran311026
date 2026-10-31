import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { BackBtn, Btn, Err, ScrollArea, Tap } from '../ui/kit'
import { acceptInvitation } from '../services/familyApi'
import { backendConfigured, currentSession } from '../services/backend'
import { startSync } from '../services/sync'

/** Opened from an invitation link (#join/<code>). Access starts only when the signed-in person taps Accept; the server decides if it is allowed. */
export default function Screen51({ param }: { param?: string }) {
  const { go, home, toast } = useApp()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [done, setDone] = useState(false)
  const accept = async () => {
    if (!param) return
    setBusy(true); setErr(undefined)
    try {
      if (!(await currentSession())) { try { sessionStorage.setItem('smaran:pendingInvite', param) } catch { /* private mode */ } go('02', 'signin'); return }
      await acceptInvitation(param); await startSync(); setDone(true); toast('You have joined the family.', 'success')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.') }
    setBusy(false)
  }
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <BackBtn onClick={home} />
        <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>{done ? "You're in" : 'You have been invited'}</div>
        <div style={{ fontSize: 14, color: '#7A6B5D', marginTop: 10, lineHeight: 1.6 }}>
          {done ? 'You can now see what the family shared with you. They can remove your access at any time.'
            : !backendConfigured() ? 'This app is not connected to a server, so invitations cannot be accepted here.'
              : 'Someone you know would like you to help with their medicines and reminders. You only get access if you accept. You will see only what they choose to share, and they can remove your access at any time.'}
        </div>
        <Err>{err}</Err>
      </ScrollArea>
      <div className="ft">{done ? <Btn onClick={home}>Continue</Btn> : <Btn onClick={() => void accept()} disabled={busy || !backendConfigured() || !param}>Accept invitation</Btn>}</div>
    </div>
  )
}
