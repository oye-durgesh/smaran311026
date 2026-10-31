import { useSyncExternalStore } from 'react'
import type { Lang } from '../domain/types'
import * as A from '../store/actions'
import { effectiveSettings } from '../domain/people'
import { detectLang } from './lang'
import { now, store } from '../store/store'
import { handleUtterance, type Convo, type Outcome } from './brain'
import { msg, supportsReplies, type Line } from './messages'
import { startRing, stopRing } from './ringtone'
import { cancelSpeech, recognitionSupported, startRecognition, synthesisSupported, type Recognition, type RecognitionError } from './speech'
import { playSathiLine, reminderVoicePersona, stopSathiAudio } from './playback'
import { displayName } from '../domain/medicines'
import { RING_TIMEOUT_SEC } from '../domain/reminders'
import { startAgent, type AgentController } from '../services/elevenlabsAgent'
import { inQuietHours } from '../domain/quiet'

export type VoiceState = 'idle' | 'ready' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'reconnecting' | 'completed' | 'error'
export interface ChatLine { id: number; from: 'sathi' | 'user' | 'system'; text: string }
export interface VoiceError { code: 'mic-denied' | 'no-mic' | 'unsupported' | 'network' | 'speech'; message: string }

export interface VoiceSnapshot {
  state: VoiceState
  active: boolean            // a call/conversation is in progress (or incoming)
  incoming: boolean          // ringing, waiting for Answer / Not now
  mode: 'reminder' | 'assistant'
  reminderId?: string
  title: string              // "Time for Metformin 500mg"
  lines: ChatLine[]
  interim: string
  speaking: string           // the line Sathi is currently saying
  muted: boolean
  textMode: boolean
  error: VoiceError | null
  playbackError: string | null
  seconds: number
  outcome?: Outcome
  ringStatus: 'none' | 'playing' | 'blocked' | 'unsupported' | 'quiet'
  supports: { recognition: boolean; synthesis: boolean; replies: boolean }
}

const blank = (): VoiceSnapshot => ({
  state: 'idle', active: false, incoming: false, mode: 'assistant', title: '', lines: [], interim: '', speaking: '', muted: false,
  textMode: false, error: null, playbackError: null, seconds: 0, ringStatus: 'none',
  supports: { recognition: recognitionSupported(), synthesis: synthesisSupported(), replies: true },
})

class VoiceSession {
  private snap: VoiceSnapshot = blank()
  private listeners = new Set<() => void>()
  private convo: Convo = {}
  private rec: Recognition | null = null
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private ringTimer: ReturnType<typeof setTimeout> | null = null
  private lineId = 0
  private silenceRetries = 0
  private netRetries = 0
  private startedAt = 0
  private lastSathi: Line | null = null
  private gen = 0 // invalidates callbacks from a previous call
  private agent: AgentController | null = null

  get = () => this.snap
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  private set(p: Partial<VoiceSnapshot>) { this.snap = { ...this.snap, ...p }; this.listeners.forEach((l) => l()) }
  /** The language Sathi answers in: what the person is speaking now; before they have spoken, the active profile's language. */
  private spoken: Lang | null = null
  private settings = () => effectiveSettings(store.get())
  private lang = (): Lang => this.spoken ?? this.settings().language

  private push(from: ChatLine['from'], text: string) {
    this.set({ lines: [...this.snap.lines, { id: ++this.lineId, from, text }] })
  }

  private teardown() {
    this.gen++
    stopRing(); cancelSpeech(); stopSathiAudio()
    void this.agent?.end().catch(() => undefined); this.agent = null
    this.rec?.abort(); this.rec = null
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
    if (this.ringTimer) { clearTimeout(this.ringTimer); this.ringTimer = null }
  }

  /** Reset to idle (e.g. when leaving the call screens). */
  reset() { this.teardown(); this.convo = {}; this.snap = blank(); this.listeners.forEach((l) => l()) }

  // ───────── incoming reminder call ─────────
  ring(reminderId: string) {
    if (this.snap.active) return
    const r = store.get().reminders.find((x) => x.id === reminderId)
    if (!r) return
    this.teardown()
    this.spoken = null
    if (r.personId) A.setActivePerson(r.personId) // the call is explicitly about this reminder's person: their name, language, speed and voice
    this.convo = { reminderId }
    const quiet = inQuietHours()
    const ringStatus = quiet ? 'quiet' as const : startRing(this.settings().reminderTone)
    const g = this.gen
    this.snap = { ...blank(), active: true, incoming: true, mode: 'reminder', reminderId, title: r.kind === 'medicine' ? `Time for ${r.title}` : r.title, ringStatus,
      supports: { ...blank().supports, replies: supportsReplies(this.lang()) } }
    this.listeners.forEach((l) => l())
    A.recordDelivery(reminderId, { at: now().toISOString(), channel: 'incall-ui', outcome: 'delivered', note: `ring=${ringStatus}` })
    this.ringTimer = setTimeout(() => {
      if (g !== this.gen || !this.snap.incoming) return
      stopRing(); this.set({ ringStatus: 'none' })
      A.recordDelivery(reminderId, { at: now().toISOString(), channel: 'incall-ui', outcome: 'expired', note: 'ring timeout' })
    }, RING_TIMEOUT_SEC * 1000)
  }

  async answer() {
    if (!this.snap.incoming || !this.snap.reminderId) return
    if (this.ringTimer) { clearTimeout(this.ringTimer); this.ringTimer = null }
    stopRing()
    A.answerReminder(this.snap.reminderId)
    this.set({ incoming: false, ringStatus: 'none' })
    this.beginCall(true)
  }

  /** "Not now": the reminder stays due (status "declined") so it is not silently lost. */
  decline() {
    const id = this.snap.reminderId
    this.teardown()
    if (id) A.declineReminder(id)
    this.snap = { ...blank(), outcome: 'declined' }
    this.listeners.forEach((l) => l())
  }

  snoozeFromRing(minutes: 5 | 10 | 15 = 15) {
    const id = this.snap.reminderId
    this.teardown()
    if (id) A.snoozeReminder(id, minutes)
    this.snap = { ...blank(), outcome: 'snoozed' }
    this.listeners.forEach((l) => l())
  }

  // ───────── open conversation ─────────
  startAssistant() {
    this.teardown()
    this.spoken = null
    this.convo = {}
    this.snap = { ...blank(), active: true, mode: 'assistant', title: 'Talk to Sathi', supports: { ...blank().supports, replies: supportsReplies(this.lang()) } }
    this.set({ state: 'ready' })
    // No conversation starts here and nothing is spoken: the Sathi screen opens in its Ready state.
    // A live provider (e.g. ElevenLabs) is started from this point when it is integrated.
  }

  private beginCall(reminder: boolean) {
    const g = this.gen
    this.startedAt = Date.now()
    this.tickTimer = setInterval(() => this.set({ seconds: Math.floor((Date.now() - this.startedAt) / 1000) }), 1000)
    this.set({ state: 'connecting', error: null })
    const lang = this.lang()
    if (store.get().prefs.serverAgent) { void this.beginAgent(reminder, g); return }
    if (!supportsReplies(lang)) this.push('system', 'Sathi can listen in this language, but replies are only available in Hindi and English for now.')
    setTimeout(() => {
      if (g !== this.gen) return
      const s = store.get()
      const name = this.settings().address
      const r = reminder && this.snap.reminderId ? s.reminders.find((x) => x.id === this.snap.reminderId) : undefined
      const med = r?.medicineId ? displayName(s.medicines.find((m) => m.id === r.medicineId) ?? { name: r.title, strength: '' }) : r?.title ?? ''
      const line = r && r.kind === 'medicine' ? msg(lang, 'greet', { name, med }) : r ? { text: `Namaste, ${name}. ${r.title} ka time ho gaya hai. Ho gaya?`, say: `नमस्ते, ${name}. ${r.title} का समय हो गया है। हो गया?` } : msg(lang, 'hello', { name })
      this.sathiSays(line, () => this.listen())
    }, 600)
  }

  // ───────── live ElevenLabs agent (beta) ─────────
  private async beginAgent(reminder: boolean, g: number) {
    try {
      this.agent = await startAgent({
        onConnect: () => { if (g === this.gen) this.set({ state: 'listening' }) },
        onDisconnect: () => { if (g === this.gen && this.snap.state !== 'completed') this.finish(this.snap.outcome ?? 'ended') },
        onMode: (m) => { if (g === this.gen) this.set({ state: m === 'speaking' ? 'speaking' : 'listening' }) },
        onMessage: (role, text) => { if (g !== this.gen) return; this.push(role === 'user' ? 'user' : 'sathi', text); if (role === 'agent') this.set({ speaking: text }) },
        onError: (m) => { if (g === this.gen) this.fail({ code: 'network', message: `${m}. Try again, or reply by text.` }) },
      }, { reminderId: reminder ? this.snap.reminderId : undefined })
    } catch (e) {
      if (g === this.gen) this.fail({ code: 'network', message: e instanceof Error ? `${e.message} You can reply by text.` : 'Could not start the voice conversation.' })
    }
  }

  // ───────── speaking ─────────
  /** Speak this reminder's line (ElevenLabs TTS when enabled, else the browser). Text stays on screen. Audio never marks medicine taken. */
  private sathiSays(line: Line, then: () => void) {
    const g = this.gen
    this.lastSathi = line
    this.push('sathi', line.text)
    this.set({ state: 'speaking', speaking: line.text, interim: '', playbackError: null })
    cancelSpeech(); stopSathiAudio()
    const done = () => { if (g !== this.gen) return; this.set({ speaking: '' }); then() }
    if (this.snap.muted) { setTimeout(done, 700); return }
    const s = store.get()
    const rid = this.snap.reminderId
    const person = rid ? s.people.find((p) => p.id === s.reminders.find((r) => r.id === rid)?.personId) : s.people.find((p) => p.id === s.activePersonId)
    const persona = reminderVoicePersona(person)
    const rate = this.settings().speakingSpeed === 'slower' ? 0.8 : 1
    const self = this
    const signal = { get aborted() { return g !== self.gen } }
    void playSathiLine({
      say: line.say, text: line.text, lang: this.lang(), rate, persona, personId: person?.id, muted: false, useServer: s.prefs.serverVoice,
      signal, onError: (m) => { if (g === self.gen) { self.set({ playbackError: m }); self.push('system', m) } },
    }).then(done)
  }

  repeat() {
    if (this.lastSathi) { this.rec?.abort(); this.rec = null; this.sathiSays(this.lastSathi, () => this.listen()) }
  }
  toggleMute() { this.set({ muted: !this.snap.muted }); this.agent?.setMuted(this.snap.muted); if (this.snap.muted) { cancelSpeech(); stopSathiAudio() } }

  // ───────── listening ─────────
  private listen() {
    const g = this.gen
    if (this.snap.textMode) { this.set({ state: 'listening', interim: '' }); return }
    if (!recognitionSupported()) {
      this.push('system', "Speech recognition isn't supported in this browser. Please type your reply.")
      this.set({ textMode: true, state: 'listening', supports: { ...this.snap.supports, recognition: false } })
      return
    }
    this.set({ state: 'listening', interim: '', error: null })
    this.rec = startRecognition(this.lang(), {
      onInterim: (t) => { if (g === this.gen) this.set({ interim: t }) },
      onFinal: (t) => { if (g !== this.gen) return; this.rec = null; this.silenceRetries = 0; this.netRetries = 0; this.handleUserText(t) },
      onError: (e) => { if (g === this.gen) this.onRecognitionError(e) },
      onEnd: () => { /* errors and results are handled above */ },
    })
  }

  private onRecognitionError(e: RecognitionError) {
    this.rec = null
    if (e === 'aborted') return
    if (e === 'permission-denied') return this.fail({ code: 'mic-denied', message: 'Microphone access is blocked. Allow the microphone in your browser, or reply by text.' })
    if (e === 'audio-capture') return this.fail({ code: 'no-mic', message: 'No microphone was found. You can reply by text.' })
    if (e === 'unsupported') return this.fail({ code: 'unsupported', message: "Speech recognition isn't supported in this browser. You can reply by text." })
    if (e === 'network') {
      if (this.netRetries++ < 2) { this.set({ state: 'reconnecting' }); const g = this.gen; setTimeout(() => g === this.gen && this.listen(), 1500); return }
      return this.fail({ code: 'network', message: 'Connection lost. Try again, or reply by text.' })
    }
    if (e === 'no-speech') {
      if (this.silenceRetries++ < 1) { this.listen(); return }
      this.silenceRetries = 0
      this.sathiSays(msg(this.lang(), 'noSpeech'), () => { this.set({ textMode: true }); this.listen() })
      return
    }
    this.fail({ code: 'speech', message: 'Something went wrong while listening. Try again, or reply by text.' })
  }

  private fail(error: VoiceError) {
    cancelSpeech(); stopSathiAudio(); this.rec?.abort(); this.rec = null
    this.set({ state: 'error', error })
  }

  // ───────── user input ─────────
  handleUserText(text: string) {
    const clean = text.trim()
    if (!clean || !this.snap.active) return
    if (this.agent) { this.push('user', clean); this.agent.sendText(clean); return }
    const g = this.gen
    this.rec?.abort(); this.rec = null
    this.push('user', clean)
    this.set({ state: 'processing', interim: '' })
    setTimeout(() => {
      if (g !== this.gen) return
      this.spoken = detectLang(clean, this.lang()) // follow the language the person just used
      const res = handleUtterance(clean, this.convo, this.lang())
      this.convo = res.convo
      this.sathiSays(res.line, () => {
        if (res.end) this.finish(res.end)
        else this.listen()
      })
    }, 350)
  }

  retry() {
    if (!this.snap.active) return
    this.netRetries = 0
    this.set({ state: 'connecting', error: null })
    const g = this.gen
    setTimeout(() => g === this.gen && this.listen(), 500)
  }

  useText() {
    this.rec?.abort(); this.rec = null; cancelSpeech()
    this.set({ textMode: true, state: 'listening', error: null })
  }

  private finish(outcome: Outcome) {
    const id = this.snap.reminderId
    const summary = ({ taken: 'Reported taking medicine', snoozed: 'Asked to be reminded later', rescheduled: 'Rescheduled a reminder', created: 'Created a reminder', cancelled: 'Cancelled a reminder', 'saved-reading': 'Recorded a health reading', ended: 'Call ended', declined: 'Declined' } as const)[outcome]
    A.logConversation(outcome, summary, id)
    this.teardown()
    this.set({ state: 'completed', outcome })
  }

  end() {
    if (!this.snap.active) return
    this.finish(this.snap.outcome ?? 'ended')
  }
}

export const voice = new VoiceSession()
export const useVoice = (): VoiceSnapshot => useSyncExternalStore(voice.subscribe, voice.get)
