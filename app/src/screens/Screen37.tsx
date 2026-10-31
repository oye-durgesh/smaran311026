import { useApp } from '../app/AppContext'
import { useVoice, voice } from '../voice/session'
import { SathiStage } from '../ui/SathiStage'
import { Tap } from '../ui/kit'

export default function Screen37() {
  const { home } = useApp()
  const v = useVoice()
  const failed = v.state === 'error' || !v.active
  const title = !v.active ? 'No call in progress' : v.state === 'error' ? ({ 'mic-denied': 'Microphone blocked', 'no-mic': 'No microphone found', unsupported: 'Voice input unavailable', network: 'Connection lost', speech: 'Could not listen' } as const)[v.error?.code ?? 'speech'] : 'Connection lost'
  const body = !v.active ? 'Start a conversation from Home.' : v.state === 'error' ? v.error?.message : 'Trying to reconnect…'
  const btn = { height: 48, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 } as const
  return (
    <SathiStage state="disconnected" controls={false} seconds={v.active ? v.seconds : undefined}
      notice={
        <div role="alert" style={{ background: 'rgba(183,91,83,.2)', border: '1px solid rgba(183,91,83,.3)', borderRadius: 14, padding: '14px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: '#fff', fontWeight: 500 }}>{title}</div>
          <div style={{ fontSize: 13, color: 'rgba(245,239,230,.75)', marginTop: 6, lineHeight: 1.4 }}>{body}</div>
          {!failed && <div style={{ width: 28, height: 28, margin: '12px auto 0', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
        </div>
      }
      extra={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 300 }}>
          <Tap onClick={() => (v.active ? voice.retry() : voice.startAssistant())} style={{ ...btn, background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 500 }}>Try again</Tap>
          <Tap onClick={() => (v.active ? voice.useText() : (voice.startAssistant(), voice.useText()))} style={{ ...btn, border: '1px solid rgba(255,255,255,.2)', color: 'rgba(245,239,230,.85)' }}>Respond by text</Tap>
          <Tap onClick={() => { voice.reset(); home() }} style={{ textAlign: 'center', fontSize: 13, color: 'rgba(245,239,230,.75)', padding: '6px 0 4px' }}>End call</Tap>
        </div>
      } />
  )
}
