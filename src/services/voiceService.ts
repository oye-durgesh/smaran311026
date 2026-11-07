import type { ReadingDraft } from './healthService';
import type { ProfileId } from '../types';
import { BackendError, backendConfigured, callFunction, hasSession } from './backend';
import { isVoiceRole, resolveVoiceIdentity } from './identity';
import { closeCallAudio, resetVoiceAudioDiag, startAgentPlayback, unlockCallAudio, voiceAudioDiag, voiceLog } from './callAudio';

/**
 * Voice boundary. Health capture still uses labelled sample transcripts.
 * Mother/Father calls always go through elevenlabs-session (signed URL on the server).
 * ELEVENLABS_API_KEY never leaves the Edge Function.
 */
export type CallState = 'ringing' | 'connecting' | 'listening' | 'speaking' | 'reconnecting' | 'ended';
export type CallPhase = 'requesting_mic' | 'connecting' | 'listening' | 'user_speaking' | 'sathi_speaking' | 'mic_error';

export interface ParsedHealth {
  draft: ReadingDraft | null;
  transcript: string;
  problem?: string;
}

export interface LiveCall {
  end(): Promise<void>
  setMuted(muted: boolean): void
  isMuted(): boolean
  inputVolume(): number
}

export interface VoiceLine { role: 'user' | 'agent'; text: string }

/** Live-call diagnostics for verification. Never stores the signed URL. */
export const voiceDiag = {
  who: '' as string,
  fnStatus: 0,
  signedUrlReturned: false,
  wsConnected: false,
  conversationId: '',
  agentAudioChunks: 0,
  lastChunkBytes: 0,
  audioContextState: '',
  playbackStarted: false,
  playbackError: '',
  micMuted: false as boolean | null,
  status: '' as string,
  mode: '' as string,
  agentTexts: [] as string[],
  userTexts: [] as string[],
  error: '',
  vadScore: 0,
  inputVolume: 0,
  micLive: false,
  micUplink: false,
}

if (typeof window !== 'undefined') {
  const w = window as unknown as { __smaranVoice?: typeof voiceDiag; __smaranVoiceAudio?: typeof voiceAudioDiag }
  w.__smaranVoice = voiceDiag
  w.__smaranVoiceAudio = voiceAudioDiag
}

export function resetVoiceDiag() {
  voiceDiag.who = ''
  voiceDiag.fnStatus = 0
  voiceDiag.signedUrlReturned = false
  voiceDiag.wsConnected = false
  voiceDiag.conversationId = ''
  voiceDiag.agentAudioChunks = 0
  voiceDiag.lastChunkBytes = 0
  voiceDiag.audioContextState = ''
  voiceDiag.playbackStarted = false
  voiceDiag.playbackError = ''
  voiceDiag.micMuted = null
  voiceDiag.status = ''
  voiceDiag.mode = ''
  voiceDiag.agentTexts = []
  voiceDiag.userTexts = []
  voiceDiag.error = ''
  voiceDiag.vadScore = 0
  voiceDiag.inputVolume = 0
  voiceDiag.micLive = false
  voiceDiag.micUplink = false
  resetVoiceAudioDiag()
}

export interface VoiceService {
  readonly isDemo: boolean;
  record(sample?: string): Promise<string>;
  parseHealth(transcript: string): ParsedHealth;
  runCall(onState: (s: CallState) => void): () => void;
  /**
   * Mother/Father: always a real ElevenLabs session, or an error. Never simulated.
   * Self: returns null so the existing simulated call stays.
   */
  tryLiveCall(opts: {
    profileId: ProfileId
    occurrenceId?: string
    onMode: (mode: 'listening' | 'speaking') => void
    onDisconnect: () => void
    onError: (message: string) => void
    onTranscript?: (line: VoiceLine) => void
    onPhase?: (phase: CallPhase) => void
    signal?: AbortSignal
  }): Promise<LiveCall | null>;
}

/** Only SDK user_transcript events are the user. Agent/AI source must never render as "You". */
export function classifyVoiceMessage(p: { role?: string; source?: string; message?: string }): VoiceLine | null {
  const text = (p.message ?? '').trim()
  if (!text) return null
  if (p.role === 'user' || p.source === 'user') return { role: 'user', text }
  if (p.role === 'agent' || p.source === 'ai' || p.source === 'agent') return { role: 'agent', text }
  return { role: 'agent', text }
}

export const SAMPLE_TRANSCRIPTS = [
  'Aaj mera sugar 130 hai. Breakfast ke baad check kiya. Maine do roti aur chai pi thi.',
  'Mera sugar aaj 180 aaya, breakfast se pehle. Note kar lo.',
  'Mera BP aaj 130/80 aaya.',
];

export function parseHealthText(transcript: string): ParsedHealth {
  const t = transcript.toLowerCase();
  const bp = t.match(/(\d{2,3})\s*(?:\/|by|upar|over)\s*(\d{2,3})/);
  if (bp) {
    const systolic = Number(bp[1]);
    const diastolic = Number(bp[2]);
    if (systolic < 70 || systolic > 260 || diastolic < 40 || diastolic > 160) return { draft: null, transcript, problem: 'That blood pressure looks unusual. Please check the numbers.' };
    return { draft: { type: 'bp', systolic, diastolic }, transcript };
  }
  const num = t.match(/(?:sugar|shugar|glucose)[^0-9]{0,20}(\d{2,3})|(\d{2,3})\s*(?:mg|hai|aaya|tha)/);
  const value = num ? Number(num[1] ?? num[2]) : NaN;
  if (!/sugar|shugar|glucose/.test(t) || Number.isNaN(value)) {
    return { draft: null, transcript, problem: "I couldn't find a specific number in what you said. Please say or enter the reading value." };
  }
  if (value < 20 || value > 700) return { draft: null, transcript, problem: 'That value looks unusual. Please check and enter it again.' };

  let context: ReadingDraft['context'];
  let contextLabel: string | undefined;
  const meal = /(breakfast|nashta|lunch|dinner|khana)/.exec(t)?.[1];
  const mealName = meal === 'nashta' ? 'breakfast' : meal === 'khana' ? 'meal' : meal;
  if (/(se pehle|before|fasting|khali pet|empty stomach)/.test(t)) {
    context = /fasting|khali pet|empty stomach/.test(t) || mealName === 'breakfast' ? 'Fasting' : 'Before meal';
    contextLabel = context === 'Fasting' ? 'Fasting' : `Before ${mealName ?? 'meal'}`;
  } else if (/(ke baad|baad mein|after)/.test(t)) {
    context = 'After meal';
    contextLabel = `After ${mealName ?? 'meal'}`;
  }
  const mealDesc = transcript.match(/(?:maine|maine ne|i had|khaya|khayi)\s+(.+?)(?:\s+(?:pi|khayi|khaya|li|kha)\b.*|\.|$)/i)?.[1];
  return { draft: { type: 'sugar', value, context, contextLabel, meal: mealDesc ? capitalize(translateMeal(mealDesc.replace(/\s+/g, ' ').trim())) : undefined }, transcript };
}
const MEAL_WORDS: Record<string, string> = { ek: 'one', do: 'two', teen: 'three', char: 'four', aur: 'and', chai: 'tea', doodh: 'milk', dal: 'dal', chawal: 'rice', sabzi: 'sabzi' };
const translateMeal = (t: string) => t.split(' ').map((w) => MEAL_WORDS[w.toLowerCase()] ?? w).join(' ').replace(/\b(two|three|four) roti\b/, '$1 rotis');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const demoImpl: Omit<VoiceService, 'tryLiveCall'> = {
  isDemo: true,
  record(sample = SAMPLE_TRANSCRIPTS[0]) {
    return new Promise((res) => setTimeout(() => res(sample), 1800));
  },
  parseHealth: parseHealthText,
  runCall(onState) {
    const steps: [CallState, number][] = [['connecting', 1500], ['listening', 2500], ['speaking', 3500], ['ended', 0]];
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      const [st, ms] = steps[i++];
      onState(st);
      if (i < steps.length) timer = setTimeout(next, ms);
    };
    next();
    return () => clearTimeout(timer);
  },
};

export const demoVoiceService: VoiceService = {
  ...demoImpl,
  async tryLiveCall() { return null; },
};

function voiceError(e: unknown): string {
  if (e instanceof BackendError) {
    if (e.status === 401 || e.code === 'not_signed_in') return e.message
    if (e.status === 403 || e.code === 'profile_not_synced' || e.code === 'forbidden') return e.message
    if (e.code === 'missing_credentials' || e.code === 'auth') return 'Voice is not connected: the ElevenLabs API key was rejected or is missing. Ask the project owner to update the Edge Function secret.'
    if (e.code === 'agent_not_configured' || e.code === 'agent_invalid' || e.code === 'agent_ids_identical' || e.code === 'tools_unavailable' || e.code === 'missing_tool_secret' || e.code === 'tools_patch_failed' || e.code === 'tools_create_failed' || e.code === 'tools_list_failed' || e.code === 'agent_update_failed' || e.code === 'session_failed') return e.message
    if (e.status === 429 || e.code === 'rate_limit') return 'The voice service is busy. Please try again shortly.'
    if (e.status === 502 || e.status === 500 || e.code === 'unavailable') return e.message || 'Could not start the voice session. Check your connection and try again.'
    return e.message
  }
  if (e instanceof Error) {
    if (/notallowed|permission/i.test(e.name + e.message)) return 'Microphone permission is needed for Sathi to hear you. Allow the microphone, then retry.'
    if (/network|failed to fetch|offline/i.test(e.message)) return 'The network dropped. Check your connection and retry.'
    return e.message
  }
  return 'Could not start the voice session.'
}

let activeLive: LiveCall | null = null

export async function endActiveLive(): Promise<void> {
  const cur = activeLive
  activeLive = null
  if (cur) await cur.end().catch(() => undefined)
  await closeCallAudio()
}

export function getActiveLive(): LiveCall | null { return activeLive }

/** Permission probe only. Tracks are stopped so the SDK can own the live capture. */
async function requestMicPermission(signal?: AbortSignal): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new BackendError('This browser cannot use the microphone.', 0, 'mic')
  const stream = await Promise.race([
    navigator.mediaDevices.getUserMedia({ audio: true, signal } as MediaStreamConstraints & { signal?: AbortSignal }),
    new Promise<never>((_, rej) => {
      const t = setTimeout(() => rej(new BackendError('Microphone permission is needed for Sathi to hear you. Allow the microphone, then retry.', 0, 'mic')), 8000)
      signal?.addEventListener('abort', () => { clearTimeout(t); rej(new BackendError('Call cancelled.', 0, 'cancelled')) })
    }),
  ])
  const live = stream.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled !== false)
  stream.getTracks().forEach((t) => t.stop())
  if (!live) throw new BackendError('The microphone did not start. Check browser permission and try again.', 0, 'mic')
}

export async function tryLiveCall(opts: Parameters<VoiceService['tryLiveCall']>[0]): Promise<LiveCall | null> {
  if (!isVoiceRole(opts.profileId)) return null
  if (activeLive) return activeLive
  try {
    if (!backendConfigured()) throw new BackendError('Sign in to talk to Sathi. Mother and Father use a real voice session, which needs a Smaran account.', 401, 'not_signed_in')
    if (!(await hasSession())) throw new BackendError('Sign in to talk to Sathi. Mother and Father use a real voice session, which needs a Smaran account.', 401, 'not_signed_in')
    if (opts.signal?.aborted) throw new BackendError('Call cancelled.', 0, 'cancelled')
    resetVoiceDiag()
    voiceDiag.who = opts.profileId
    opts.onPhase?.('requesting_mic')
    await unlockCallAudio()
    await requestMicPermission(opts.signal)
    voiceDiag.micLive = true
    voiceLog('mic_permission', { granted: true })
    if (opts.signal?.aborted) throw new BackendError('Call cancelled.', 0, 'cancelled')
    opts.onPhase?.('connecting')
    const ident = await resolveVoiceIdentity(opts.profileId)
    const sess = await callFunction<{ signedUrl?: string; agent?: string; personId?: string; toolSession?: string; reminderStatus?: string }>('elevenlabs-session', {
      personId: ident.personId,
      ...(opts.occurrenceId ? { occurrenceId: opts.occurrenceId } : {}),
    })
    voiceDiag.fnStatus = 200
    const signedUrl = typeof sess.signedUrl === 'string' ? sess.signedUrl : ''
    voiceDiag.signedUrlReturned = /^(https|wss):\/\//i.test(signedUrl)
    if (!voiceDiag.signedUrlReturned) {
      throw new BackendError('The voice service returned no session URL.', 502, 'unavailable')
    }
    if (sess.agent !== ident.expectedAgent || sess.personId !== ident.personId) {
      throw new BackendError('The voice agent did not match this family member. The call was not started.', 502, 'agent_mismatch')
    }
    const { Conversation } = await import('@elevenlabs/client')
    if (activeLive) return activeLive
    voiceLog('ws_connecting', { connectionType: 'websocket' })
    let peakVad = 0
    let listenStartedAt = 0
    let micWarned = false
    let micWatch: ReturnType<typeof setInterval> | undefined
    const conv = await Conversation.startSession({
      signedUrl,
      connectionType: 'websocket',
      textOnly: false,
      dynamicVariables: {
        smaran_session: typeof sess.toolSession === 'string' ? sess.toolSession : '',
        relationship: ident.role,
      },
      onConnect: ({ conversationId }) => {
        voiceDiag.wsConnected = true
        voiceDiag.conversationId = conversationId || 'connected'
        voiceDiag.status = 'connected'
        voiceAudioDiag.wsStatus = 'connected'
        voiceLog('ws_connected', { conversationId: conversationId ? 'yes' : 'no' })
        void startAgentPlayback().then((ok: boolean) => {
          voiceDiag.playbackStarted = voiceAudioDiag.playbackStarted
          voiceDiag.audioContextState = voiceAudioDiag.audioContextState
          voiceDiag.playbackError = voiceAudioDiag.playbackError
          if (ok) voiceLog('playback_started', { audioContextState: voiceAudioDiag.audioContextState })
        })
      },
      onStatusChange: ({ status }) => {
        voiceDiag.status = status
        voiceAudioDiag.wsStatus = status
        voiceLog('ws_status', { status })
      },
      onAudio: (chunk: string) => {
        voiceDiag.agentAudioChunks += 1
        voiceDiag.lastChunkBytes = Math.floor((chunk?.length ?? 0) * 0.75)
        voiceAudioDiag.audioEvents = voiceDiag.agentAudioChunks
        voiceAudioDiag.lastChunkBytes = voiceDiag.lastChunkBytes
        voiceAudioDiag.lastChunkEncoding = 'base64'
        if (voiceDiag.agentAudioChunks <= 3 || voiceDiag.agentAudioChunks % 20 === 0) {
          voiceLog('audio_event', {
            chunks: voiceDiag.agentAudioChunks,
            bytes: voiceDiag.lastChunkBytes,
            encoding: 'base64',
            audioContextState: voiceAudioDiag.audioContextState,
          })
        }
        if (voiceDiag.agentAudioChunks === 1 || voiceDiag.agentAudioChunks % 20 === 0) {
          void startAgentPlayback()
        }
      },
      onDisconnect: () => {
        if (micWatch) clearInterval(micWatch)
        voiceDiag.wsConnected = false
        voiceDiag.status = 'disconnected'
        voiceAudioDiag.wsStatus = 'disconnected'
        voiceLog('ws_disconnected', { chunks: voiceDiag.agentAudioChunks, playbackStarted: voiceAudioDiag.playbackStarted })
        if (activeLive) { activeLive = null; opts.onDisconnect() }
      },
      onError: (m: unknown) => {
        const msg = typeof m === 'string' ? m : 'Voice connection error'
        voiceDiag.error = msg
        voiceLog('playback_error', { error: 'session_error' })
        opts.onError(msg)
      },
      onVadScore: ({ vadScore }: { vadScore: number }) => {
        voiceDiag.vadScore = vadScore
        if (vadScore > peakVad) peakVad = vadScore
        if (vadScore > 0.08 && !voiceDiag.micMuted) {
          voiceDiag.micUplink = true
          if (voiceDiag.mode === 'listening') opts.onPhase?.('user_speaking')
        }
      },
      onModeChange: (m: { mode: 'speaking' | 'listening' }) => {
        voiceDiag.mode = m.mode
        if (m.mode === 'speaking') {
          opts.onPhase?.('sathi_speaking')
          void startAgentPlayback().then(() => {
            voiceDiag.playbackStarted = voiceAudioDiag.playbackStarted
            voiceDiag.audioContextState = voiceAudioDiag.audioContextState
            voiceDiag.playbackError = voiceAudioDiag.playbackError
          })
        } else {
          listenStartedAt = Date.now()
          opts.onPhase?.('listening')
        }
        opts.onMode(m.mode)
      },
      onMessage: (p: { role?: string; source?: string; message?: string }) => {
        const line = classifyVoiceMessage(p)
        if (!line) return
        if (line.role === 'user') {
          voiceDiag.userTexts.push(line.text)
          voiceDiag.micUplink = true
          voiceLog('user_transcript', { chars: line.text.length })
        } else {
          voiceDiag.agentTexts.push(line.text)
        }
        opts.onTranscript?.(line)
      },
    })
    const session = conv as {
      endSession: () => Promise<void>
      setMicMuted: (muted: boolean) => void
      setVolume?: (v: { volume: number }) => void
      getInputVolume?: () => number
    }
    session.setVolume?.({ volume: 1 })
    session.setMicMuted(false)
    voiceDiag.micMuted = false
    await startAgentPlayback()
    voiceDiag.playbackStarted = voiceAudioDiag.playbackStarted
    voiceDiag.audioContextState = voiceAudioDiag.audioContextState
    voiceDiag.playbackError = voiceAudioDiag.playbackError
    voiceDiag.inputVolume = session.getInputVolume?.() ?? 0
    voiceLog('mic_session', { inputVolume: Number(voiceDiag.inputVolume.toFixed(4)), muted: false })
    micWatch = setInterval(() => {
      const vol = session.getInputVolume?.() ?? 0
      voiceDiag.inputVolume = vol
      if (vol > 0.01 && !voiceDiag.micMuted) voiceDiag.micUplink = true
      if (
        voiceDiag.mode === 'listening'
        && !voiceDiag.micMuted
        && voiceDiag.userTexts.length === 0
        && peakVad < 0.05
        && listenStartedAt
        && Date.now() - listenStartedAt > 12000
        && !micWarned
      ) {
        micWarned = true
        opts.onPhase?.('mic_error')
        voiceLog('mic_silent', { inputVolume: Number(vol.toFixed(4)), peakVad: Number(peakVad.toFixed(3)) })
      }
    }, 1500)
    const live: LiveCall = {
      end: async () => {
        if (micWatch) clearInterval(micWatch)
        if (activeLive === live) activeLive = null
        await session.endSession()
      },
      setMuted: (muted) => {
        session.setMicMuted(muted)
        voiceDiag.micMuted = muted
        voiceLog('mic_mute', { muted })
      },
      isMuted: () => voiceDiag.micMuted === true,
      inputVolume: () => session.getInputVolume?.() ?? voiceDiag.inputVolume,
    }
    activeLive = live
    return live
  } catch (e) {
    const msg = voiceError(e)
    voiceDiag.error = msg
    if (e instanceof BackendError && e.status) voiceDiag.fnStatus = e.status
    opts.onError(msg)
    return null
  }
}

export const voiceService: VoiceService = {
  ...demoImpl,
  tryLiveCall,
};
