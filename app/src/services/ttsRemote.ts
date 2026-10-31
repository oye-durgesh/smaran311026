/** Sathi's replies through the server TTS function (ElevenLabs), in the persona the user selected (default | mom | dad).
 *  The server returns which persona it actually used (x-voice-persona); if that is not the one requested, the audio is
 *  discarded and an error is raised — a different person's voice is never played. Any failure falls back to the browser voice. */
import { backendConfigured, BackendError, callFunctionBlobWithHeaders, hasSession } from './backend'
import { store } from '../store/store'
import { voicePersona } from '../domain/people'
import { localHealth } from './localApi'

let current: HTMLAudioElement | null = null
export async function remoteVoiceAvailable(): Promise<boolean> {
  if (backendConfigured() && (await hasSession())) return true
  return !!(await localHealth())?.elevenlabs.key
}

async function fetchSpeech(text: string, persona: string, personId?: string): Promise<{ blob: Blob; headers: Headers }> {
  const body = { text, persona, personId }
  if (backendConfigured() && (await hasSession())) return callFunctionBlobWithHeaders('tts', body)
  // local dev API (no accounts): consent comes from this device's own setting
  const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, consent: store.get().prefs.voiceCloningConsent }) })
  if (!r.ok) { let b: { error?: string; code?: string } = {}; try { b = await r.json() } catch { /* */ } throw new BackendError(b.error ?? `Request failed (${r.status})`, r.status, b.code) }
  return { blob: await r.blob(), headers: r.headers }
}

/** Persona is read at call time, so switching takes effect on the very next utterance. */
export const currentPersona = () => voicePersona(store.get())

export class VoiceError extends Error {
  constructor(message: string, readonly code: string) { super(message) }
}
export function voiceErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'voice_not_configured': return fallback
    case 'voice_invalid': return 'This person’s ElevenLabs agent has no usable Voice setting. Check the agent in the ElevenLabs dashboard.'
    case 'agent_not_configured': return 'This person’s Sathi agent is not configured on the server.'
    case 'agent_invalid': return 'This person’s Sathi agent could not be found in ElevenLabs.'
    case 'consent_required': return 'Voice consent is needed before a cloned voice can be used (Privacy settings).'
    case 'missing_credentials': return 'The server voice is not set up yet.'
    case 'rate_limit': return 'The voice service is busy. Please try again shortly.'
    case 'persona_mismatch': return 'The server answered with a different voice than the one selected, so it was not played.'
    default: return fallback
  }
}

export async function speakRemote(text: string, o: { rate: number; persona?: 'default' | 'mom' | 'dad'; personId?: string; onStart?: () => void; onEnd: () => void; onError: (m: string) => void }): Promise<void> {
  const persona = o.persona ?? currentPersona()
  try {
    const { blob, headers } = await fetchSpeech(text, persona, o.personId)
    if (headers.get('x-voice-persona') !== persona) throw new VoiceError(voiceErrorMessage('persona_mismatch', ''), 'persona_mismatch')
    const url = URL.createObjectURL(blob)
    const a = new Audio(url)
    current = a
    a.playbackRate = o.rate
    a.onplay = () => o.onStart?.()
    a.onended = () => { URL.revokeObjectURL(url); current = null; o.onEnd() }
    a.onerror = () => { URL.revokeObjectURL(url); current = null; o.onError('audio playback failed') }
    await a.play()
  } catch (e) {
    if (e instanceof BackendError) o.onError(voiceErrorMessage(e.code, e.message))
    else o.onError(e instanceof Error ? e.message : 'voice service unavailable')
  }
}
export function stopRemote() { if (current) { current.pause(); current = null } }
