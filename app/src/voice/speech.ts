import type { Lang } from '../domain/types'

export const RECOGNITION_LANG: Record<Lang, string> = { hi: 'hi-IN', en: 'en-IN', mr: 'mr-IN', kn: 'kn-IN' }

/* Minimal typings for the (prefixed) Web Speech API. */
interface SRAlt { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlt; length: number }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SRErrorEvent { error: string }
interface SR {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start(): void; stop(): void; abort(): void
}
type SRCtor = new () => SR
const srCtor = (): SRCtor | undefined =>
  typeof window === 'undefined' ? undefined
    : ((window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition)

export const recognitionSupported = () => !!srCtor()
export const synthesisSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export type RecognitionError = 'permission-denied' | 'unsupported' | 'no-speech' | 'audio-capture' | 'network' | 'aborted' | 'other'

export interface Recognition {
  stop(): void
  abort(): void
}

export function startRecognition(lang: Lang, h: {
  onInterim?: (t: string) => void
  onFinal: (t: string) => void
  onError: (e: RecognitionError) => void
  onEnd: () => void
}): Recognition | null {
  const C = srCtor()
  if (!C) { h.onError('unsupported'); return null }
  const r = new C()
  r.lang = RECOGNITION_LANG[lang]
  r.continuous = false
  r.interimResults = true
  r.maxAlternatives = 1
  let gotFinal = false
  r.onresult = (e) => {
    let interim = '', final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]
      if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript
    }
    if (interim) h.onInterim?.(interim)
    if (final.trim()) { gotFinal = true; h.onFinal(final.trim()) }
  }
  r.onerror = (e) => {
    const map: Record<string, RecognitionError> = {
      'not-allowed': 'permission-denied', 'service-not-allowed': 'permission-denied', 'no-speech': 'no-speech',
      'audio-capture': 'audio-capture', network: 'network', aborted: 'aborted',
    }
    h.onError(map[e.error] ?? 'other')
  }
  r.onend = () => { if (!gotFinal) { /* error handler already reported if it was an error */ } h.onEnd() }
  try { r.start() } catch { h.onError('other'); return null }
  return { stop: () => { try { r.stop() } catch { /* already stopped */ } }, abort: () => { try { r.abort() } catch { /* already stopped */ } } }
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const base = lang.split('-')[0]
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.toLowerCase().startsWith(base))
}

export interface SpeakOptions { lang: Lang; rate: number; onStart?: () => void; onEnd: () => void; onError: (msg: string) => void }

/** Speak text with the browser voice. Returns false when speech output is unavailable (caller shows text only). */
export function speak(say: string, fallbackText: string, o: SpeakOptions): boolean {
  if (!synthesisSupported()) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const wanted = RECOGNITION_LANG[o.lang]
  const voice = pickVoice(wanted)
  // No voice for this language installed → speak the romanised text with an English (India) voice instead.
  const text = voice ? say : fallbackText
  const u = new SpeechSynthesisUtterance(text)
  const v = voice ?? pickVoice('en-IN') ?? pickVoice('en-US')
  if (v) { u.voice = v; u.lang = v.lang } else u.lang = voice ? wanted : 'en-IN'
  u.rate = o.rate
  u.onstart = () => o.onStart?.()
  u.onend = () => o.onEnd()
  u.onerror = (e) => o.onError(String((e as SpeechSynthesisErrorEvent).error ?? 'speech error'))
  synth.speak(u)
  return true
}
export function cancelSpeech() { if (synthesisSupported()) window.speechSynthesis.cancel() }

export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported'

export async function microphonePermission(): Promise<PermissionStatus> {
  try {
    if (!navigator.permissions) return typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'prompt' : 'unsupported'
    const p = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return p.state as PermissionStatus
  } catch { return typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'prompt' : 'unsupported' }
}
export async function requestMicrophone(): Promise<PermissionStatus> {
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return 'unsupported'
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return 'granted'
  } catch (e) {
    const name = (e as DOMException).name
    return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unsupported'
  }
}
export function notificationPermission(): PermissionStatus {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission === 'default' ? 'prompt' : (Notification.permission as PermissionStatus)
}
export async function requestNotifications(): Promise<PermissionStatus> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    const r = await Notification.requestPermission()
    return r === 'default' ? 'prompt' : (r as PermissionStatus)
  } catch { return 'unsupported' }
}
