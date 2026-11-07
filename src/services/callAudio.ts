// Browser playback helpers for the ElevenLabs WebSocket output path.
// The SDK concatenates PCM/μ-law in an AudioWorklet and routes it to a hidden
// <audio> element (MediaStreamDestination). That element must be played after
// a user gesture; autoplay is often blocked once the session fetch returns.

export type VoiceAudioDiag = {
  wsStatus: string
  audioEvents: number
  lastChunkBytes: number
  lastChunkEncoding: string
  audioContextState: string
  outputElements: number
  outputPaused: boolean | null
  playbackStarted: boolean
  playbackCompleted: boolean
  playbackError: string
}

export const voiceAudioDiag: VoiceAudioDiag = {
  wsStatus: '',
  audioEvents: 0,
  lastChunkBytes: 0,
  lastChunkEncoding: '',
  audioContextState: '',
  outputElements: 0,
  outputPaused: null,
  playbackStarted: false,
  playbackCompleted: false,
  playbackError: '',
}

export function resetVoiceAudioDiag() {
  voiceAudioDiag.wsStatus = ''
  voiceAudioDiag.audioEvents = 0
  voiceAudioDiag.lastChunkBytes = 0
  voiceAudioDiag.lastChunkEncoding = ''
  voiceAudioDiag.audioContextState = ''
  voiceAudioDiag.outputElements = 0
  voiceAudioDiag.outputPaused = null
  voiceAudioDiag.playbackStarted = false
  voiceAudioDiag.playbackCompleted = false
  voiceAudioDiag.playbackError = ''
}

const isSecretish = (s: string) =>
  /xi-api-key|authorization|bearer\s+\S+|smaran[_-]?session|signed[_-]?url|toolsession|secret|token=/i.test(s)

export function voiceLog(event: string, extra: Record<string, unknown> = {}) {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(extra)) {
    if (/signedurl|token|secret|session|authorization|hmac/i.test(k)) clean[k] = '[redacted]'
    else if (typeof v === 'string' && isSecretish(v)) clean[k] = '[redacted]'
    else clean[k] = v
  }
  console.info('[smaran-voice]', event, clean)
}

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
}

let unlockCtx: AudioContext | null = null
let outputWatcher: MutationObserver | null = null

function watchOutputElements() {
  if (typeof document === 'undefined' || outputWatcher) return
  outputWatcher = new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of rec.addedNodes) {
        const el = node instanceof HTMLAudioElement
          ? node
          : node instanceof Element ? node.querySelector('audio') : null
        if (el) void startAgentPlayback()
      }
    }
  })
  outputWatcher.observe(document.body, { childList: true, subtree: true })
}

export async function unlockCallAudio(): Promise<void> {
  const Ctor = audioContextCtor()
  if (!Ctor) return
  try {
    if (!unlockCtx || unlockCtx.state === 'closed') unlockCtx = new Ctor()
    const ctx = unlockCtx
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.start(0)
    if (ctx.state === 'suspended') await ctx.resume()
    voiceAudioDiag.audioContextState = ctx.state
    watchOutputElements()
    voiceLog('audio_unlock', { audioContextState: ctx.state })
  } catch (e) {
    voiceAudioDiag.playbackError = e instanceof Error ? e.message.slice(0, 120) : 'unlock_failed'
    voiceLog('playback_error', { error: voiceAudioDiag.playbackError, stage: 'unlock' })
  }
}

export function agentOutputElements(): HTMLAudioElement[] {
  if (typeof document === 'undefined') return []
  return [...document.querySelectorAll('audio')].filter((el) => el.srcObject instanceof MediaStream)
}

export async function startAgentPlayback(): Promise<boolean> {
  if (unlockCtx && unlockCtx.state === 'suspended') {
    await unlockCtx.resume().catch(() => undefined)
  }
  voiceAudioDiag.audioContextState = unlockCtx?.state || voiceAudioDiag.audioContextState
  const els = agentOutputElements()
  voiceAudioDiag.outputElements = els.length
  if (!els.length) {
    voiceLog('playback_pending', { outputElements: 0, audioContextState: voiceAudioDiag.audioContextState })
    return false
  }
  let started = false
  for (const el of els) {
    el.muted = false
    el.volume = 1
    el.autoplay = true
    el.setAttribute('playsinline', 'true')
    try {
      await el.play()
      started = !el.paused
      voiceAudioDiag.outputPaused = el.paused
      voiceAudioDiag.playbackStarted = started
      el.onplaying = () => {
        voiceAudioDiag.playbackStarted = true
        voiceAudioDiag.outputPaused = false
        voiceLog('playback_started', { paused: el.paused, readyState: el.readyState })
      }
      el.onended = () => {
        voiceAudioDiag.playbackCompleted = true
        voiceLog('playback_completed', { readyState: el.readyState })
      }
      el.onerror = () => {
        voiceAudioDiag.playbackError = 'element_error'
        voiceLog('playback_error', { error: 'element_error' })
      }
      voiceLog('playback_attempt', { paused: el.paused, muted: el.muted, readyState: el.readyState, tracks: el.srcObject instanceof MediaStream ? el.srcObject.getAudioTracks().length : 0 })
    } catch (e) {
      voiceAudioDiag.playbackError = e instanceof Error ? e.name : 'play_failed'
      voiceLog('playback_error', { error: voiceAudioDiag.playbackError })
    }
  }
  return started
}

export async function closeCallAudio(): Promise<void> {
  outputWatcher?.disconnect()
  outputWatcher = null
  if (unlockCtx && unlockCtx.state !== 'closed') {
    await unlockCtx.close().catch(() => undefined)
  }
  unlockCtx = null
}
