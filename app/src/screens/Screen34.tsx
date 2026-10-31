import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { voice, useVoice } from '../voice/session'
import { SathiStage, StatePreview, type StageState } from '../ui/SathiStage'

/**
 * Sathi — immersive voice screen. It opens in the Ready state and plays nothing.
 * No live voice provider is connected yet: the state strip lets every visual state be previewed, and
 * the Talk / Mute / End handlers below are the places a provider's start / mute / stop calls go.
 */
export default function Screen34() {
  const { home } = useApp()
  const v = useVoice()
  const [state, setState] = useState<StageState>('ready')
  const end = () => { voice.reset(); home() }
  return (
    <SathiStage
      state={state}
      seconds={v.seconds}
      subtitle="Voice not connected yet"
      caption={state === 'ready' ? 'Sathi will talk with you here once voice is connected.' : state === 'disconnected' ? 'Voice is not connected yet.' : 'Preview only — no microphone or audio is used.'}
      onMic={() => setState(state === 'listening' ? 'ready' : 'listening')}
      onMute={() => setState(state === 'muted' ? 'ready' : 'muted')}
      onEnd={end}
      extra={<StatePreview value={state} onChange={setState} />}
    />
  )
}
