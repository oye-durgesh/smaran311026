import { useVoice, voice } from '../voice/session'
import { SathiStage } from '../ui/SathiStage'
import { TextBar } from '../ui/callparts'

export default function Screen35() {
  const v = useVoice()
  return (
    <SathiStage state={v.muted ? 'muted' : 'listening'} seconds={v.seconds} caption={v.interim ? `${v.interim}…` : v.textMode ? 'Microphone is off. Type your reply below.' : undefined}
      notice={v.playbackError ? <div role="alert" style={{ fontSize: 13, color: '#F0B8B2', textAlign: 'center', maxWidth: 280 }}>{v.playbackError}</div> : undefined}
      onMic={() => voice.useText()} onMute={() => voice.toggleMute()} onEnd={() => voice.end()} extra={<TextBar v={v} />} />
  )
}
