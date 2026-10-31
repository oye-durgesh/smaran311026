import { useVoice, voice } from '../voice/session'
import { SathiStage } from '../ui/SathiStage'
import { TextBar } from '../ui/callparts'

export default function Screen36() {
  const v = useVoice()
  const line = v.speaking || v.lines.filter((l) => l.from === 'sathi').slice(-1)[0]?.text
  return (
    <SathiStage state={v.muted ? 'muted' : 'speaking'} seconds={v.seconds} caption={line ? `“${line}”` : undefined}
      notice={v.playbackError ? <div role="alert" style={{ fontSize: 13, color: '#F0B8B2', textAlign: 'center', maxWidth: 280 }}>{v.playbackError}</div> : undefined}
      onMic={() => voice.useText()} onMute={() => voice.toggleMute()} onEnd={() => voice.end()} extra={<TextBar v={v} />} />
  )
}
