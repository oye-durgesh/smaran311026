/**
 * Play one Sathi line. Server TTS (ElevenLabs `tts`) is used when enabled and available; otherwise the browser voice.
 * A missing/failed server voice never borrows another persona. Playback errors are reported; the caller still continues.
 */
import type { Lang, Person } from '../domain/types'
import { assignedVoicePersona } from '../domain/people'
import { speak as browserSpeak } from './speech'
import { remoteVoiceAvailable, speakRemote, stopRemote } from '../services/ttsRemote'

export type Persona = Person['sathiVoice']

/** Assigned Sathi voice, with mother→mom and father→dad when the chip is still Default. */
export const reminderVoicePersona = assignedVoicePersona

export async function playSathiLine(input: {
  say: string
  text: string
  lang: Lang
  rate: number
  persona: Persona
  personId?: string
  muted: boolean
  useServer: boolean
  signal?: { aborted: boolean }
  onError: (message: string) => void
}): Promise<void> {
  if (input.muted || input.signal?.aborted) return
  const say = input.say.slice(0, 600)
  if (input.useServer && (await remoteVoiceAvailable())) {
    const remote = await new Promise<'ok' | 'fail'>((resolve) => {
      void speakRemote(say, {
        rate: input.rate,
        persona: input.persona,
        personId: input.personId,
        onEnd: () => resolve('ok'),
        onError: (m) => { input.onError(m); resolve('fail') },
      })
    })
    if (remote === 'ok' || input.signal?.aborted) return
  }
  if (input.signal?.aborted) return
  await new Promise<void>((resolve) => {
    const ok = browserSpeak(say, input.text, {
      lang: input.lang,
      rate: input.rate,
      onEnd: resolve,
      onError: (m) => { input.onError(m); resolve() },
    })
    if (!ok) { input.onError("Sathi's voice could not play on this device."); resolve() }
  })
}

export function stopSathiAudio() {
  stopRemote()
}
