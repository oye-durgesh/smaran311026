// ElevenLabs server-tool webhook. Identity comes from the signed smaran_session, not from the model.
// Service-role access is scoped to the session owner + bound family member.

import { corsHeaders, json, serviceClient, timingSafeEqual } from '../_shared/http.ts'
import { configuredAgent, type AgentWho } from '../_shared/elevenlabs.ts'
import { verifyToolSession, type ToolAgent } from '../_shared/tool-session.ts'
import { MEDICINE_TOOL_NAMES, runMedicineTool, type ToolName } from '../_shared/medicine-tools.ts'
import { supabaseMedicineStore } from '../_shared/medicine-store.ts'

const isTool = (n: string): n is ToolName => (MEDICINE_TOOL_NAMES as string[]).includes(n)

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k]
  }
  return undefined
}

function parseBody(raw: unknown): { tool?: string; params: Record<string, unknown>; agentId?: string; conversationId?: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const nested = (b.parameters ?? b.params ?? b.tool_call ?? {}) as Record<string, unknown>
  const tc = (nested.parameters ?? nested.params ?? nested) as Record<string, unknown>
  const params = { ...b, ...tc }
  const tool = String(pick(b, ['tool_name', 'name', 'tool']) ?? pick(nested, ['tool_name', 'name']) ?? '')
  return {
    tool,
    params,
    agentId: String(pick(b, ['agent_id', 'agentId']) ?? ''),
    conversationId: String(pick(b, ['conversation_id', 'conversationId']) ?? ''),
  }
}

function agentFromId(id: string): ToolAgent | null {
  const env = (k: string) => Deno.env.get(k)
  for (const who of ['mummy', 'papa'] as AgentWho[]) {
    const cfg = configuredAgent(env, who)
    if (cfg.ok && cfg.agentId === id) return who
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const expected = (Deno.env.get('SMARAN_TOOL_SECRET') ?? Deno.env.get('ELEVENLABS_API_KEY') ?? '').trim()
  const got = (req.headers.get('X-Smaran-Tool-Secret') ?? req.headers.get('xi-webhook-secret') ?? '').trim()
  if (!expected || !got || !timingSafeEqual(expected, got)) {
    return json({ ok: false, code: 'permission_denied', message: 'I cannot verify the current schedule right now.' }, 401)
  }

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = parseBody(raw)
  const headerTool = req.headers.get('X-Smaran-Tool-Name') ?? ''
  const tool = isTool(headerTool) ? headerTool : isTool(parsed.tool) ? parsed.tool : null
  if (!tool) return json({ ok: false, code: 'invalid', message: 'Unknown tool.' }, 400)

  const token = String(parsed.params.smaran_session ?? parsed.params.session ?? '')
  const claims = await verifyToolSession(expected, token)
  if (!claims) return json({ ok: false, code: 'permission_denied', message: 'I cannot verify the current schedule right now.' }, 403)

  const webhookAgent = parsed.agentId ? agentFromId(parsed.agentId) : null
  const store = supabaseMedicineStore(serviceClient())
  try {
    const result = await runMedicineTool(store, { claims, webhookAgent, now: new Date() }, tool, parsed.params)
    return json(result, result.ok ? 200 : result.code === 'unavailable' ? 503 : result.code === 'permission_denied' ? 403 : 200)
  } catch {
    return json({ ok: false, code: 'unavailable', message: 'I cannot verify the current schedule right now.' }, 503)
  }
})
