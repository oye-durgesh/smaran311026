import { useApp } from '../app/AppContext'
import { updatePrefs, wipeAll } from '../store/actions'
import { useStore } from '../store/store'
import { BackBtn, ChevRight, ScrollArea, Tap, Toggle } from '../ui/kit'
import { SheetTitle } from '../ui/Overlays'
import { backendConfigured } from '../services/backend'

const pill = (text: string, onClick: () => void, label: string) => (
  <Tap label={label} onClick={onClick} style={{ padding: '3px 8px', background: '#E7EDE2', borderRadius: 999, fontSize: 11, color: '#526D51' }}>{text}</Tap>
)

export default function Screen44() {
  const { go, back, toast, confirm, openSheet } = useApp()
  const prefs = useStore((s) => s.prefs)
  const hasHealthData = useStore((s) => s.readings.length)
  const row = (icon: React.ReactNode, title: string, sub: string, right: React.ReactNode, onClick?: () => void) => (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && onClick()} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid #F0EBE0', cursor: onClick ? 'pointer' : 'default' }}>
      {icon}<div style={{ flex: 1 }}><div style={{ fontSize: 15 }}>{title}</div><div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 2 }}>{sub}</div></div>{right}
    </div>
  )
  const ic = (d: React.ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5">{d}</svg>

  const toggleRecordings = () => {
    if (prefs.voiceRecordings) { updatePrefs({ voiceRecordings: false }); toast('Voice recordings are off.'); return }
    confirm({ title: 'Keep voice recordings?', message: 'Recordings are not available in this demo build. This only saves your preference for when a connected server is set up.', confirmLabel: 'Turn on', onConfirm: () => { updatePrefs({ voiceRecordings: true }); toast('Preference saved.') } })
  }
  const consent = () => openSheet(<ConsentSheet />)
  const del = () => confirm({
    title: 'Delete all my data?', message: 'This removes your profile, medicines, reminders, readings, appointments and family list from this device. It cannot be undone.',
    confirmLabel: 'Delete everything', danger: true,
    onConfirm: () => { void wipeAll().then(() => { toast('All data deleted from this device.'); window.location.hash = '#01' }) },
  })
  return (
    <div className="scr" style={{ padding: '20px 24px 80px', boxSizing: 'border-box', overflow: 'auto', height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>Privacy &amp; Data</div>
        </div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>Control what Smaran stores and who can see it.</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20 }}>
          {row(ic(<><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>), 'Voice recordings', prefs.voiceRecordings ? 'Preference saved — recording is not available in demo mode' : 'Not stored after conversation ends', pill(prefs.voiceRecordings ? 'On' : 'Off', toggleRecordings, 'Voice recordings: tap to change'))}
          {row(ic(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></>), 'Conversation summaries', 'Short notes saved, not full transcripts', pill(prefs.conversationSummaries ? 'On' : 'Off', () => updatePrefs({ conversationSummaries: !prefs.conversationSummaries }), 'Conversation summaries: tap to change'))}
          {row(ic(<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />), 'Health readings', `${backendConfigured() ? 'Stored securely on Smaran servers' : 'Stored on this device only'}${hasHealthData ? ` · ${hasHealthData} saved` : ''}`, <ChevRight />, () => go(hasHealthData ? '23' : '27'))}
          {row(ic(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" /></>), 'Family access', 'Control what family members can see', <ChevRight />, () => go('41', 'defaults'))}
          {row(ic(<><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 010 14.14" /></>), 'Voice cloning consent', prefs.voiceCloningConsent ? 'Consent recorded' : 'Not enabled', <ChevRight />, consent)}
        </div>
        <div className="sep" />
        <Tap onClick={del} style={{ height: 48, background: 'rgba(183,91,83,.06)', border: '1px solid rgba(183,91,83,.2)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, color: '#B75B53', fontWeight: 500 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B75B53" strokeWidth="1.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>Delete all my data
        </Tap>
      </ScrollArea>
    </div>
  )
}

function ConsentSheet() {
  const { toast, closeSheet } = useApp()
  const on = useStore((s) => s.prefs.voiceCloningConsent)
  return (
    <div>
      <SheetTitle sub="Sathi can speak in a familiar voice, but only with clear permission.">Voice cloning consent</SheetTitle>
      <div style={{ fontSize: 14, color: '#7A6B5D', lineHeight: 1.6 }}>
        • Sathi is an AI companion, not a real person, and says so.<br />
        • Only a voice that belongs to you, or whose owner has given you written permission, may be used.<br />
        • You can withdraw consent at any time; the voice is then no longer used.<br />
        • No voice is cloned in demo mode — this only records your choice.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
        <span style={{ fontSize: 15 }}>I confirm I have permission for the voice I use</span>
        <Toggle on={on} onChange={(v) => { updatePrefs({ voiceCloningConsent: v }); toast(v ? 'Consent recorded.' : 'Consent withdrawn.') }} label="Voice cloning consent" />
      </div>
      <Tap onClick={closeSheet} style={{ marginTop: 20, height: 48, background: '#2E241B', color: '#F5EFE6', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Done</Tap>
    </div>
  )
}
