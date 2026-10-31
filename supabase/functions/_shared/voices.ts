// Sathi voice helpers. Pure (no Deno/Node APIs) so Edge Functions, the local dev server and tests share them.
// Mom and Dad reminder speech uses the Voice ID configured on each conversational agent (resolved server-side).
// A persona never falls back to another persona's voice.
export type Persona = 'default' | 'mom' | 'dad'
export const PERSONAS: Persona[] = ['default', 'mom', 'dad']
export const isPersona = (v: unknown): v is Persona => typeof v === 'string' && (PERSONAS as string[]).includes(v)

/** Optional default-voice secret. Mom/Dad reminder TTS does not use these; it reads the agent’s Voice setting. */
export const VOICE_ENV: Record<Persona, string> = {
  default: 'ELEVENLABS_VOICE_ID',
  mom: 'ELEVENLABS_MOM_VOICE_ID',
  dad: 'ELEVENLABS_DAD_VOICE_ID',
}

export type VoiceFailure = 'bad_persona' | 'voice_not_configured' | 'consent_required' | 'voice_invalid'
export type VoiceResolution = { ok: true; persona: Persona; voiceId: string } | { ok: false; persona: Persona | null; code: VoiceFailure; message: string }

const ID_RE = /^[A-Za-z0-9]{10,40}$/
export const isVoiceId = (id: string) => ID_RE.test(id)
export const personaLabel = (p: Persona) => (p === 'mom' ? "Mom's" : p === 'dad' ? "Dad's" : 'the default')

/** Instant Voice Clone / similar categories. Premade, professional and generated library voices are licensed, not clones. */
export const CLONED_VOICE_CATEGORIES = new Set(['cloned', 'cloned_professional', 'professional_cloned'])
export const isClonedVoiceCategory = (category: unknown) =>
  typeof category === 'string' && CLONED_VOICE_CATEGORIES.has(category.trim().toLowerCase())

/** Env-based Voice ID (the default Sathi voice only). Mom/Dad must not use this path. */
export function resolveVoice(personaIn: unknown, env: (k: string) => string | undefined, _consent = true): VoiceResolution {
  const persona = personaIn === undefined || personaIn === null || personaIn === '' ? 'default' : personaIn
  if (!isPersona(persona)) return { ok: false, persona: null, code: 'bad_persona', message: 'Unknown voice selection.' }
  if (persona !== 'default') {
    return { ok: false, persona, code: 'voice_not_configured', message: `${personaLabel(persona)} voice is taken from that person’s ElevenLabs agent, not from a Voice ID secret.` }
  }
  const id = (env(VOICE_ENV.default) ?? '').trim()
  if (!id) return { ok: false, persona, code: 'voice_not_configured', message: 'The default voice is not set up on the server (ELEVENLABS_VOICE_ID is missing).' }
  if (!ID_RE.test(id)) return { ok: false, persona, code: 'voice_invalid', message: 'ELEVENLABS_VOICE_ID does not look like a valid ElevenLabs voice ID.' }
  return { ok: true, persona, voiceId: id }
}

/** Map an ElevenLabs HTTP failure to our codes. 404/422 on a voice means the configured ID is wrong. */
export function voiceFailureFromStatus(status: number): { code: VoiceFailure | 'unavailable' | 'auth' | 'rate_limit'; http: number } {
  if (status === 404 || status === 422 || status === 400) return { code: 'voice_invalid', http: 502 }
  if (status === 401 || status === 403) return { code: 'auth', http: 502 }
  if (status === 429) return { code: 'rate_limit', http: 429 }
  return { code: 'unavailable', http: 502 }
}
