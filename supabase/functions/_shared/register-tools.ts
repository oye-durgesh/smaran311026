// Register Smaran medicine webhook tools on the Mother and Father ElevenLabs agents.
// Tools read live database state. Prompts must not list medicine names or times.

import type { Env } from './elevenlabs.ts'
import { configuredAgent, type AgentWho } from './elevenlabs.ts'
import { MEDICINE_TOOL_NAMES } from './medicine-tools.ts'

const HARDCODED = /\b(metformin|amlodipine|ecosprin|atorvastatin|ramesh|05:51|08:30\s*pm|12:25|3:52|15:52)\b/i
export const TOOLS_PROMPT_VERSION = 'SMARAN_TOOLS_V3'
export const DEFAULT_TOOLS_WEBHOOK_URL = 'https://oqcfpdfhtwvpirhcusbi.supabase.co/functions/v1/elevenlabs-tools'
const MARKER = `<!-- ${TOOLS_PROMPT_VERSION} -->`
const GENERIC_FIRST = 'नमस्ते, मैं साथी हूँ, एक एआई साथी। मैं आपके स्मारण रिकॉर्ड से अभी की दवाई और समय देखती हूँ।'

export const TOOL_PROMPT_ADDENDUM = [
  MARKER,
  'Never guess or memorise medicine names, doses, or reminder times. Ignore any medicine names or clock times that appear in older instructions or examples.',
  'On every medicine or reminder turn, call get_triggering_dose first (then get_todays_medicine_status if needed). Use only the returned records.',
  'If this call was started from a reminder, announce that exact occurrence. Do not announce a different upcoming dose.',
  'Speak the time in Hindi using time_spoken_hi from the tool result. Also keep the exact HH:MM from the time field. Never invent or round the minutes.',
  'If a tool fails, is unavailable, or says the reminder is no longer on the schedule, say you cannot verify the current schedule. Do not invent a list or reuse a previous conversation.',
  'Never give independent medical advice or change a prescribed dose.',
  'mark_medicine_taken and snooze_medicine_reminder require the person to confirm the specific medicine and time. Set confirmed=true only after they confirm.',
  'Always pass smaran_session unchanged from the conversation dynamic variables. Never invent a family_member_id.',
  'Speak in the language given by speak_in / language on the tool result.',
].join(' ')

const schemas: Record<string, { description: string; properties: Record<string, unknown>; required?: string[] }> = {
  get_triggering_dose: {
    description: 'Fetch the exact dose bound to this reminder call from the Smaran database (name, strength, dose, HH:MM). Call this first on a reminder call. Do not guess.',
    properties: {
      smaran_session: { type: 'string', description: 'Pass the smaran_session dynamic variable unchanged.' },
    },
    required: ['smaran_session'],
  },
  get_medicine_schedule: {
    description: 'Fetch the current active medicines and exact clock times from the Smaran database for this conversation’s family member.',
    properties: {
      smaran_session: { type: 'string', description: 'Pass the smaran_session dynamic variable unchanged.' },
    },
    required: ['smaran_session'],
  },
  get_todays_medicine_status: {
    description: 'Fetch today’s dose occurrences and statuses (upcoming, due, taken, skipped, snoozed, overdue) from the database.',
    properties: {
      smaran_session: { type: 'string', description: 'Pass the smaran_session dynamic variable unchanged.' },
    },
    required: ['smaran_session'],
  },
  get_next_medicine_dose: {
    description: 'If this call is bound to a reminder, return that occurrence. Otherwise return the next pending dose from the database.',
    properties: {
      smaran_session: { type: 'string', description: 'Pass the smaran_session dynamic variable unchanged.' },
    },
    required: ['smaran_session'],
  },
  mark_medicine_taken: {
    description: 'Mark one scheduled dose as taken after the person confirms the medicine and time. Never mark taken only because a medicine was mentioned.',
    properties: {
      smaran_session: { type: 'string', description: 'Pass the smaran_session dynamic variable unchanged.' },
      medicine_name: { type: 'string', description: 'Medicine name the person confirmed.' },
      medicine_id: { type: 'string', description: 'Medicine id from a previous tool result, if available.' },
      time: { type: 'string', description: 'Exact HH:MM of the dose occurrence.' },
      occurrence_id: { type: 'string', description: 'Occurrence id from a previous tool result.' },
      confirmed: { type: 'boolean', description: 'true only after the person confirmed this specific dose.' },
    },
    required: ['smaran_session', 'confirmed'],
  },
  snooze_medicine_reminder: {
    description: 'Snooze one confirmed dose occurrence and return the new reminder time.',
    properties: {
      smaran_session: { type: 'string', description: 'Pass the smaran_session dynamic variable unchanged.' },
      medicine_name: { type: 'string' },
      medicine_id: { type: 'string' },
      time: { type: 'string' },
      occurrence_id: { type: 'string' },
      minutes: { type: 'number', description: '5, 10, or 15.' },
      confirmed: { type: 'boolean', description: 'true only after the person confirmed this specific dose.' },
    },
    required: ['smaran_session', 'confirmed'],
  },
  get_medicine_history: {
    description: 'Return recent dose history for this conversation’s family member from the database.',
    properties: {
      smaran_session: { type: 'string', description: 'Pass the smaran_session dynamic variable unchanged.' },
    },
    required: ['smaran_session'],
  },
}

export function webhookUrl(env: Env): string {
  const override = (env('SMARAN_TOOL_WEBHOOK_URL') ?? '').trim()
  if (override) return override
  const base = (env('SUPABASE_URL') ?? '').replace(/\/$/, '')
  if (base) return `${base}/functions/v1/elevenlabs-tools`
  return DEFAULT_TOOLS_WEBHOOK_URL
}

export function medicineToolConfig(name: string, url: string, secret: string) {
  const spec = schemas[name]
  return {
    name,
    description: spec.description,
    type: 'webhook' as const,
    api_schema: {
      url,
      method: 'POST' as const,
      content_type: 'application/json' as const,
      request_headers: {
        'X-Smaran-Tool-Secret': secret,
        'X-Smaran-Tool-Name': name,
      },
      request_body_schema: {
        type: 'object',
        description: spec.description,
        properties: spec.properties,
        required: spec.required ?? ['smaran_session'],
      },
    },
    dynamic_variables: {
      dynamic_variable_placeholders: { smaran_session: 'smaran_session' },
    },
  }
}

export function promptHasHardcodedSchedule(prompt: string): boolean {
  return HARDCODED.test(stripToolAddendum(prompt))
}

export function stripToolAddendum(prompt: string): string {
  return prompt
    .replace(/\n*<!-- SMARAN_TOOLS_V\d+ -->[\s\S]*$/m, '')
    .replace(/\n*Never guess or memorise medicine names[\s\S]*$/m, '')
    .trim()
}

export function applyToolPrompt(existing: string): { prompt: string; changed: boolean } {
  const personality = stripToolAddendum(existing)
    .split(/(?<=[।.\n])/)
    .filter((s) => s.length && !HARDCODED.test(s))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const next = `${personality}\n\n${TOOL_PROMPT_ADDENDUM}`.trim()
  return { prompt: next, changed: next !== existing.trim() }
}

type AgentPayload = {
  conversation_config?: {
    agent?: {
      first_message?: string
      prompt?: { prompt?: string; tool_ids?: string[]; [k: string]: unknown }
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  [k: string]: unknown
}

const ready = new Map<string, { version: string; at: number }>()
export function resetEnsureAgentToolsCache() { ready.clear() }

type ListedTool = {
  id?: string
  tool_config?: {
    name?: string
    api_schema?: { url?: string; method?: string; request_headers?: Record<string, unknown> }
    [k: string]: unknown
  }
}

function mergeToolConfig(prev: Record<string, unknown> | undefined, next: ReturnType<typeof medicineToolConfig>) {
  const prevSchema = (prev?.api_schema && typeof prev.api_schema === 'object') ? prev.api_schema as Record<string, unknown> : {}
  const prevDyn = (prev?.dynamic_variables && typeof prev.dynamic_variables === 'object') ? prev.dynamic_variables as Record<string, unknown> : {}
  const prevPlace = (prevDyn.dynamic_variable_placeholders && typeof prevDyn.dynamic_variable_placeholders === 'object')
    ? prevDyn.dynamic_variable_placeholders as Record<string, unknown>
    : {}
  return {
    ...prev,
    name: next.name,
    description: next.description,
    type: 'webhook',
    api_schema: {
      ...prevSchema,
      url: next.api_schema.url,
      method: next.api_schema.method,
      content_type: next.api_schema.content_type,
      request_headers: next.api_schema.request_headers,
      request_body_schema: next.api_schema.request_body_schema,
    },
    dynamic_variables: {
      ...prevDyn,
      dynamic_variable_placeholders: { ...prevPlace, smaran_session: 'smaran_session' },
    },
  }
}

export async function ensureAgentTools(env: Env, who: AgentWho, f: typeof fetch = fetch): Promise<{ ok: boolean; hardcoded: boolean; skipped?: boolean; error?: string }> {
  const key = (env('ELEVENLABS_API_KEY') ?? '').trim()
  const cfg = configuredAgent(env, who)
  if (!key || !cfg.ok) return { ok: false, hardcoded: false, error: 'not_configured' }
  const secret = (env('SMARAN_TOOL_SECRET') ?? '').trim()
  if (!secret) return { ok: false, hardcoded: false, error: 'missing_tool_secret' }

  const cached = ready.get(cfg.agentId)
  if (cached && cached.version === TOOLS_PROMPT_VERSION && Date.now() - cached.at < 10 * 60 * 1000) {
    return { ok: true, hardcoded: false, skipped: true }
  }

  const url = webhookUrl(env)
  const api = `${env('ELEVENLABS_BASE_URL') ?? 'https://api.elevenlabs.io'}/v1/convai`
  const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' }

  const list = await f(`${api}/tools`, { headers })
  if (!list.ok) return { ok: false, hardcoded: false, error: `tools_list_${list.status}` }
  const listed = await list.json() as { tools?: ListedTool[] }
  const have = new Map((listed.tools ?? []).filter((t) => t.id && t.tool_config?.name).map((t) => [t.tool_config!.name!, t]))
  const ids: string[] = []

  for (const name of MEDICINE_TOOL_NAMES) {
    const next = medicineToolConfig(name, url, secret)
    const existing = have.get(name)
    if (existing?.id) {
      let prevCfg: Record<string, unknown> | undefined = existing.tool_config as Record<string, unknown> | undefined
      const detail = await f(`${api}/tools/${existing.id}`, { headers })
      if (detail.ok) {
        const dj = await detail.json() as ListedTool
        if (dj.tool_config) prevCfg = dj.tool_config as Record<string, unknown>
      }
      const patched = await f(`${api}/tools/${existing.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ tool_config: mergeToolConfig(prevCfg, next) }),
      })
      if (!patched.ok) return { ok: false, hardcoded: false, error: `tool_patch_${name}_${patched.status}` }
      ids.push(existing.id)
      continue
    }
    const created = await f(`${api}/tools`, { method: 'POST', headers, body: JSON.stringify({ tool_config: next }) })
    if (!created.ok) return { ok: false, hardcoded: false, error: `tool_create_${name}_${created.status}` }
    const j = await created.json() as { id?: string }
    if (!j.id) return { ok: false, hardcoded: false, error: `tool_create_${name}_noid` }
    ids.push(j.id)
  }

  if (ids.length !== MEDICINE_TOOL_NAMES.length) return { ok: false, hardcoded: false, error: 'tools_incomplete' }

  const agent = await f(`${api}/agents/${cfg.agentId}`, { headers })
  if (!agent.ok) return { ok: false, hardcoded: false, error: `agent_${agent.status}` }
  const aj = await agent.json() as AgentPayload
  const promptObj = { ...(aj.conversation_config?.agent?.prompt ?? {}) }
  const currentPrompt = String(promptObj.prompt ?? '')
  const applied = applyToolPrompt(currentPrompt)
  const prevIds = Array.isArray(promptObj.tool_ids) ? promptObj.tool_ids as string[] : []
  const tool_ids = [...new Set([...prevIds, ...ids])]
  const attached = ids.every((id) => tool_ids.includes(id))
  const first = aj.conversation_config?.agent?.first_message ?? ''
  const firstDirty = HARDCODED.test(first)
  const hardcoded = promptHasHardcodedSchedule(currentPrompt) || firstDirty
  const agentNeedsPatch = applied.changed || firstDirty || !attached || !currentPrompt.includes(MARKER)

  if (agentNeedsPatch) {
    const agentCfg = { ...(aj.conversation_config?.agent ?? {}) }
    agentCfg.prompt = { ...promptObj, prompt: applied.prompt, tool_ids }
    if (firstDirty) agentCfg.first_message = GENERIC_FIRST
    const patched = await f(`${api}/agents/${cfg.agentId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        conversation_config: { ...(aj.conversation_config ?? {}), agent: agentCfg },
      }),
    })
    if (!patched.ok) return { ok: false, hardcoded, error: `agent_patch_${patched.status}` }
  }

  ready.set(cfg.agentId, { version: TOOLS_PROMPT_VERSION, at: Date.now() })
  return { ok: true, hardcoded: false }
}
