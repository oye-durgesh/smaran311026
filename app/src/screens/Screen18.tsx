import { useVoice, voice } from '../voice/session'
import { SathiStage } from '../ui/SathiStage'
import { TextBar } from '../ui/callparts'

/** Processing: no chat log — only the state, and the words just heard. */
export default function Screen18() {
  const v = useVoice()
  const heard = v.interim || v.lines.filter((l) => l.from === 'user').slice(-1)[0]?.text
  return (
    <SathiStage state={v.muted ? 'muted' : v.state === 'processing' ? 'processing' : 'listening'} seconds={v.seconds} caption={heard ? `“${heard}”` : undefined}
      onMic={() => voice.useText()} onMute={() => voice.toggleMute()} onEnd={() => voice.end()} extra={<TextBar v={v} />} />
  )
}
