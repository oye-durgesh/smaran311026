// Register Smaran medicine webhook tools on the Mother and Father ElevenLabs agents.
// Tools read live database state. Prompts must not list medicine names or times.

import type { Env } from './elevenlabs.ts'
import { configuredAgent, type AgentWho } from './elevenlabs.ts'
import { MEDICINE_TOOL_NAMES } from './medicine-tools.ts'
import { logStage, sanitizeErrorMessage } from './safe-log.ts'

const HARDCODED = /\b(metformin|amlodipine|ecosprin|atorvastatin|ramesh|05:51|08:30\s*pm|12:25|3:52|15:52)\b/i
export const TOOLS_PROMPT_VERSION = 'SMARAN_TOOLS_V4'
export const DEFAULT_TOOLS_WEBHOOK_URL = 'https://oqcfpdfhtwvpirhcusbi.supabase.co/functions/v1/elevenlabs-tools'
const MARKER = `<!-- ${TOOLS_PROMPT_VERSION} -->`
const GENERIC_FIRST = 'नमस्ते, मैं साथी हूँ, एक एआई साथी। मैं आपके स्मारण रिकॉर्ड से अभी की दवाई और समय देखती हूँ।'
const KEEP_TOOL_FIELDS = [
  'assignments',
  'execution_mode',
  'response_timeout_secs',
  'follow_redirects',
  'follow_redirects_allowed_domains',
  'interruption_mode',
  'pre_tool_speech',
  'tool_call_sound',
  'tool_call_sound_behavior',
  'tool_error_handling_mode',
] as const

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

const sessionProp = { type: 'string', dynamic_variable: 'smaran_session' }

const schemas: Record<string, { description: string; properties: Record<string, unknown>; required?: string[] }> = {
  get_triggering_dose: {
    description: 'Fetch the exact dose bound to this reminder call from the Smaran database (name, strength, dose, HH:MM). Call this first on a reminder call. Do not guess.',
    properties: { smaran_session: sessionProp },
    required: ['smaran_session'],
  },
  get_medicine_schedule: {
    description: 'Fetch the current active medicines and exact clock times from the Smaran database for this conversation’s family member.',
    properties: { smaran_session: sessionProp },
    required: ['smaran_session'],
  },
  get_todays_medicine_status: {
    description: 'Fetch today’s dose occurrences and statuses (upcoming, due, taken, skipped, snoozed, overdue) from the database.',
    properties: { smaran_session: sessionProp },
    required: ['smaran_session'],
  },
  get_next_medicine_dose: {
    description: 'If this call is bound to a reminder, return that occurrence. Otherwise return the next pending dose from the database.',
    properties: { smaran_session: sessionProp },
    required: ['smaran_session'],
  },
  mark_medicine_taken: {
    description: 'Mark one scheduled dose as taken after the person confirms the medicine and time. Never mark taken only because a medicine was mentioned.',
    properties: {
      smaran_session: sessionProp,
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
      smaran_session: sessionProp,
      medicine_name: { type: 'string', description: 'Medicine name the person confirmed.' },
      medicine_id: { type: 'string', description: 'Medicine id from a previous tool result.' },
      time: { type: 'string', description: 'Exact HH:MM of the dose occurrence.' },
      occurrence_id: { type: 'string', description: 'Occurrence id from a previous tool result.' },
      minutes: { type: 'number', description: '5, 10, or 15.' },
      confirmed: { type: 'boolean', description: 'true only after the person confirmed this specific dose.' },
    },
    required: ['smaran_session', 'confirmed'],
  },
  get_medicine_history: {
    description: 'Return recent dose history for this conversation’s family member from the database.',
    properties: { smaran_session: sessionProp },
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
      prompt?: { prompt?: string; tool_ids?: string[]; tools?: unknown; [k: string]: unknown }
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  [k: string]: unknown
}

const ready = new Map<string, { version: string; at: number }>()
export function resetEnsureAgentToolsCache() { ready.clear() }

export type EnsureToolsResult = {
  ok: boolean
  hardcoded: boolean
  skipped?: boolean
  error?: string
  stage?: string
  status?: number
}

type ListedTool = {
  id?: string
  tool_config?: {
    name?: string
    api_schema?: { url?: string; method?: string; request_headers?: Record<string, unknown> }
    [k: string]: unknown
  }
}

function mergeToolConfig(prev: Record<string, unknown> | undefined, next: ReturnType<typeof medicineToolConfig>) {
  const kept: Record<string, unknown> = {}
  if (prev) {
    for (const k of KEEP_TOOL_FIELDS) {
      if (prev[k] !== undefined) kept[k] = prev[k]
    }
  }
  return {
    ...kept,
    name: next.name,
    description: next.description,
    type: 'webhook',
    api_schema: {
      url: next.api_schema.url,
      method: next.api_schema.method,
      content_type: next.api_schema.content_type,
      request_headers: next.api_schema.request_headers,
      request_body_schema: next.api_schema.request_body_schema,
    },
    dynamic_variables: {
      dynamic_variable_placeholders: { smaran_session: 'smaran_session' },
    },
  }
}

async function convai(f: typeof fetch, url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: unknown; error?: string }> {
  try {
    const r = await f(url, init)
    const text = await r.text()
    let body: unknown = {}
    if (text) {
      try { body = JSON.parse(text) } catch { body = {} }
    }
    return { ok: r.ok, status: r.status, body }
  } catch (e) {
    return { ok: false, status: 0, body: {}, error: sanitizeErrorMessage(e) }
  }
}

async function listConvaiTools(api: string, headers: Record<string, string>, f: typeof fetch): Promise<EnsureToolsResult & { tools?: ListedTool[] }> {
  const tools: ListedTool[] = []
  let cursor = ''
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ page_size: '100' })
    if (cursor) q.set('cursor', cursor)
    const list = await convai(f, `${api}/tools?${q.toString()}`, { headers })
    if (!list.ok) {
      return { ok: false, hardcoded: false, error: list.status ? `tools_list_${list.status}` : 'tools_list_network', stage: 'list_tools', status: list.status || 502 }
    }
    const listed = list.body as { tools?: ListedTool[]; has_more?: boolean; next_cursor?: string }
    tools.push(...(listed.tools ?? []))
    if (!listed.has_more || !listed.next_cursor) break
    cursor = listed.next_cursor
  }
  return { ok: true, hardcoded: false, tools }
}

export async function ensureAgentTools(env: Env, who: AgentWho, f: typeof fetch = fetch): Promise<EnsureToolsResult> {
  try {
    const key = (env('ELEVENLABS_API_KEY') ?? '').trim()
    const cfg = configuredAgent(env, who)
    if (!key || !cfg.ok) return { ok: false, hardcoded: false, error: 'not_configured', stage: 'secrets', status: 503 }
    const secret = (env('SMARAN_TOOL_SECRET') ?? '').trim()
    if (!secret) return { ok: false, hardcoded: false, error: 'missing_tool_secret', stage: 'secrets', status: 503 }

    const cached = ready.get(cfg.agentId)
    if (cached && cached.version === TOOLS_PROMPT_VERSION && Date.now() - cached.at < 10 * 60 * 1000) {
      return { ok: true, hardcoded: false, skipped: true, stage: 'cache' }
    }

    const url = webhookUrl(env)
    const api = `${env('ELEVENLABS_BASE_URL') ?? 'https://api.elevenlabs.io'}/v1/convai`
    const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' }

    const listed = await listConvaiTools(api, headers, f)
    if (!listed.ok) {
      logStage('ensureAgentTools', listed.stage ?? 'list_tools', { status: listed.status, error: listed.error })
      return listed
    }
    const have = new Map((listed.tools ?? []).filter((t) => t.id && t.tool_config?.name).map((t) => [t.tool_config!.name!, t]))
    const ids: string[] = []

    for (const name of MEDICINE_TOOL_NAMES) {
      const next = medicineToolConfig(name, url, secret)
      const existing = have.get(name)
      if (existing?.id) {
        const prevCfg = (existing.tool_config ?? {}) as Record<string, unknown>
        const patched = await convai(f, `${api}/tools/${existing.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ tool_config: mergeToolConfig(prevCfg, next) }),
        })
        if (!patched.ok) {
          const error = patched.status ? `tool_patch_${name}_${patched.status}` : `tool_patch_${name}_network`
          logStage('ensureAgentTools', 'patch_tool', { status: patched.status || 502, error })
          return { ok: false, hardcoded: false, error, stage: 'patch_tool', status: patched.status || 502 }
        }
        ids.push(existing.id)
        continue
      }
      const created = await convai(f, `${api}/tools`, { method: 'POST', headers, body: JSON.stringify({ tool_config: next }) })
      if (!created.ok) {
        const error = created.status ? `tool_create_${name}_${created.status}` : `tool_create_${name}_network`
        logStage('ensureAgentTools', 'create_tool', { status: created.status || 502, error })
        return { ok: false, hardcoded: false, error, stage: 'create_tool', status: created.status || 502 }
      }
      const j = created.body as { id?: string }
      if (!j.id) return { ok: false, hardcoded: false, error: `tool_create_${name}_noid`, stage: 'create_tool', status: 502 }
      ids.push(j.id)
    }

    if (ids.length !== MEDICINE_TOOL_NAMES.length) return { ok: false, hardcoded: false, error: 'tools_incomplete', stage: 'register_tools', status: 503 }

    const agent = await convai(f, `${api}/agents/${cfg.agentId}`, { headers })
    if (!agent.ok) {
      const error = agent.status ? `agent_${agent.status}` : 'agent_network'
      logStage('ensureAgentTools', 'get_agent', { status: agent.status || 502, error })
      return { ok: false, hardcoded: false, error, stage: 'get_agent', status: agent.status || 502 }
    }
    const aj = agent.body as AgentPayload
    const promptObj = { ...(aj.conversation_config?.agent?.prompt ?? {}) }
    delete promptObj.tools
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
      delete agentCfg.disable_interruptions
      delete agentCfg.force_pre_tool_speech
      agentCfg.prompt = { ...promptObj, prompt: applied.prompt, tool_ids }
      if (firstDirty) agentCfg.first_message = GENERIC_FIRST
      const patched = await convai(f, `${api}/agents/${cfg.agentId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          conversation_config: { ...(aj.conversation_config ?? {}), agent: agentCfg },
        }),
      })
      if (!patched.ok) {
        const error = patched.status ? `agent_patch_${patched.status}` : 'agent_patch_network'
        logStage('ensureAgentTools', 'patch_agent', { status: patched.status || 502, error })
        return { ok: false, hardcoded, error, stage: 'patch_agent', status: patched.status || 502 }
      }
    }

    ready.set(cfg.agentId, { version: TOOLS_PROMPT_VERSION, at: Date.now() })
    return { ok: true, hardcoded: false, stage: 'ready' }
  } catch (e) {
    logStage('ensureAgentTools', 'unhandled', { status: 503, error: e })
    return { ok: false, hardcoded: false, error: 'tools_exception', stage: 'unhandled', status: 503 }
  }
}
