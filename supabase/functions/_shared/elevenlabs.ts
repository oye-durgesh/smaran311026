// Server-only ElevenLabs Conversational AI helpers.
// Official signed-URL endpoint: GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=…
// The API key never leaves this module.

export type Env = (k: string) => string | undefined
export type AgentWho = 'mummy' | 'papa'
export type Fail = { ok: false; status: number; body: { error: string; code: string } }

const AGENT_ID = /^[A-Za-z0-9_-]{8,128}$/
const base = (env: Env) => env('ELEVENLABS_BASE_URL') ?? 'https://api.elevenlabs.io'

function readAgent(env: Env, who: AgentWho): { idVar: string; agentId: string } {
  const primary = who === 'mummy' ? 'ELEVENLABS_MOTHER_AGENT_ID' : 'ELEVENLABS_FATHER_AGENT_ID'
  const legacy = who === 'mummy' ? 'MUMMY_ELEVENLABS_AGENT_ID' : 'PAPA_ELEVENLABS_AGENT_ID'
  return { idVar: primary, agentId: (env(primary) ?? env(legacy) ?? '').trim() }
}

export const agentForRelationship = (relationship: unknown): AgentWho | null =>
  relationship === 'mother' ? 'mummy' : relationship === 'father' ? 'papa' : null

export function configuredAgent(env: Env, who: AgentWho): Fail | { ok: true; who: AgentWho; agentId: string; idVar: string } {
  const cfg = readAgent(env, who)
  if (!cfg.agentId) {
    return {
      ok: false, status: 503,
      body: { error: `${who === 'mummy' ? "Mother's" : "Father's"} ElevenLabs agent is not configured (${cfg.idVar} is missing).`, code: 'agent_not_configured' },
    }
  }
  if (!AGENT_ID.test(cfg.agentId)) {
    return { ok: false, status: 503, body: { error: `${cfg.idVar} does not look like an ElevenLabs agent ID.`, code: 'agent_invalid' } }
  }
  const other = readAgent(env, who === 'mummy' ? 'papa' : 'mummy')
  if (other.agentId && other.agentId === cfg.agentId) {
    return { ok: false, status: 503, body: { error: 'ELEVENLABS_MOTHER_AGENT_ID and ELEVENLABS_FATHER_AGENT_ID must be different agents.', code: 'agent_ids_identical' } }
  }
  return { ok: true, who, agentId: cfg.agentId, idVar: cfg.idVar }
}

export async function agentSession(env: Env, input: { relationship: unknown }, f: typeof fetch = fetch):
  Promise<Fail | { ok: true; agent: AgentWho; signedUrl: string }> {
  const who = agentForRelationship(input.relationship)
  if (!who) return { ok: false, status: 422, body: { error: 'Only Mother and Father have a dedicated voice agent.', code: 'no_agent_for_profile' } }
  const key = (env('ELEVENLABS_API_KEY') ?? '').trim()
  if (!key) return { ok: false, status: 503, body: { error: 'Voice conversations are not configured (ELEVENLABS_API_KEY is missing).', code: 'missing_credentials' } }
  const cfg = configuredAgent(env, who)
  if (!cfg.ok) return cfg
  let r: Response
  try {
    r = await f(`${base(env)}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(cfg.agentId)}`, {
      headers: { 'xi-api-key': key },
    })
  } catch {
    return { ok: false, status: 502, body: { error: 'The voice service could not be reached.', code: 'unavailable' } }
  }
  if (r.status === 404 || r.status === 422) return { ok: false, status: 502, body: { error: `${cfg.idVar} was not found in your ElevenLabs workspace.`, code: 'agent_invalid' } }
  if (r.status === 401 || r.status === 403) return { ok: false, status: 502, body: { error: 'ElevenLabs rejected ELEVENLABS_API_KEY.', code: 'auth' } }
  if (r.status === 429) return { ok: false, status: 429, body: { error: 'The voice service is busy. Please try again shortly.', code: 'rate_limit' } }
  if (!r.ok) return { ok: false, status: 502, body: { error: `Voice service unavailable (${r.status}).`, code: 'unavailable' } }
  const j = await r.json().catch(() => null) as { signed_url?: string } | null
  if (!j?.signed_url) return { ok: false, status: 502, body: { error: 'The voice service returned no session URL.', code: 'unavailable' } }
  return { ok: true, agent: who, signedUrl: j.signed_url }
}

export interface ProfileRow { id: string; relationship: string; active: boolean }

export async function startProfileSession(env: Env, input: {
  personId: string
  lookup: (personId: string) => Promise<ProfileRow | null>
}, f: typeof fetch = fetch): Promise<Fail | { ok: true; agent: AgentWho; signedUrl: string; personId: string }> {
  const row = await input.lookup(input.personId)
  if (!row) return { ok: false, status: 403, body: { error: 'This family profile is not saved to your account yet, or you do not have access to it.', code: 'profile_not_synced' } }
  if (!row.active) return { ok: false, status: 403, body: { error: 'You do not have access to this family profile.', code: 'forbidden' } }
  const r = await agentSession(env, { relationship: row.relationship }, f)
  return r.ok ? { ...r, personId: row.id } : r
}
