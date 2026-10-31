// Register Smaran medicine webhook tools on the Mother and Father ElevenLabs agents.
// Tools read live database state. Prompts must not list medicine names or times.

import type { Env } from './elevenlabs.ts'
import { configuredAgent, type AgentWho } from './elevenlabs.ts'
import { MEDICINE_TOOL_NAMES } from './medicine-tools.ts'

const HARDCODED = /\b(metformin|amlodipine|ecosprin|atorvastatin|ramesh|05:51|08:30\s*pm)\b/i

export const TOOL_PROMPT_ADDENDUM = [
  'Never guess or memorise medicine names, doses, or reminder times.',
  'When asked about medicines or reminders, call the medicine tools and use only the returned records.',
  'If a tool fails or is unavailable, say you cannot verify the current schedule. Do not invent a list.',
  'Never give independent medical advice or change a prescribed dose.',
  'mark_medicine_taken and snooze_medicine_reminder require the person to confirm the specific medicine and time. Set confirmed=true only after they confirm.',
  'Always pass smaran_session unchanged from the conversation dynamic variables. Never invent a family_member_id.',
  'Speak in the language given by speak_in / language on the tool result.',
].join(' ')

const schemas: Record<string, { description: string; properties: Record<string, unknown>; required?: string[] }> = {
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
    description: 'Return the next pending dose: medicine name, dose, and exact time from the database.',
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

function webhookUrl(env: Env): string {
  const override = (env('SMARAN_TOOL_WEBHOOK_URL') ?? '').trim()
  if (override) return override
  const base = (env('SUPABASE_URL') ?? '').replace(/\/$/, '')
  return `${base}/functions/v1/elevenlabs-tools`
}

export function promptHasHardcodedSchedule(prompt: string): boolean {
  return HARDCODED.test(prompt)
}

export async function ensureAgentTools(env: Env, who: AgentWho, f: typeof fetch = fetch): Promise<{ ok: boolean; hardcoded: boolean; error?: string }> {
  const key = (env('ELEVENLABS_API_KEY') ?? '').trim()
  const cfg = configuredAgent(env, who)
  if (!key || !cfg.ok) return { ok: false, hardcoded: false, error: 'not_configured' }
  const secret = (env('SMARAN_TOOL_SECRET') ?? key).trim()
  const url = webhookUrl(env)
  const api = `${env('ELEVENLABS_BASE_URL') ?? 'https://api.elevenlabs.io'}/v1/convai`
  const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' }

  const list = await f(`${api}/tools`, { headers })
  if (!list.ok) return { ok: false, hardcoded: false, error: `tools_list_${list.status}` }
  const listed = await list.json() as { tools?: { id: string; tool_config?: { name?: string } }[] }
  const have = new Map((listed.tools ?? []).map((t) => [t.tool_config?.name ?? '', t.id]))
  const ids: string[] = []

  for (const name of MEDICINE_TOOL_NAMES) {
    const spec = schemas[name]
    const body = {
      tool_config: {
        name,
        description: spec.description,
        type: 'webhook',
        api_schema: {
          url,
          method: 'POST',
          request_headers: { 'X-Smaran-Tool-Secret': secret, 'X-Smaran-Tool-Name': name },
          request_body_schema: {
            type: 'object',
            description: spec.description,
            properties: spec.properties,
            required: spec.required ?? ['smaran_session'],
          },
        },
      },
    }
    const existing = have.get(name)
    if (existing) {
      ids.push(existing)
      await f(`${api}/tools/${existing}`, { method: 'PATCH', headers, body: JSON.stringify(body) }).catch(() => undefined)
      continue
    }
    const created = await f(`${api}/tools`, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!created.ok) return { ok: false, hardcoded: false, error: `tool_create_${name}_${created.status}` }
    const j = await created.json() as { id?: string }
    if (j.id) ids.push(j.id)
  }

  const agent = await f(`${api}/agents/${cfg.agentId}`, { headers })
  if (!agent.ok) return { ok: false, hardcoded: false, error: `agent_${agent.status}` }
  const aj = await agent.json() as {
    conversation_config?: { agent?: { prompt?: { prompt?: string; tool_ids?: string[] } } }
  }
  const prompt = aj.conversation_config?.agent?.prompt?.prompt ?? ''
  const hardcoded = promptHasHardcodedSchedule(prompt)
  const nextPrompt = prompt.includes('Never guess or memorise medicine names') ? prompt : `${prompt.trim()}\n\n${TOOL_PROMPT_ADDENDUM}`.trim()
  const prevIds = aj.conversation_config?.agent?.prompt?.tool_ids ?? []
  const tool_ids = [...new Set([...prevIds, ...ids])]
  const patched = await f(`${api}/agents/${cfg.agentId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      conversation_config: { agent: { prompt: { prompt: nextPrompt, tool_ids } } },
    }),
  })
  if (!patched.ok) return { ok: false, hardcoded, error: `agent_patch_${patched.status}` }
  return { ok: true, hardcoded }
}
