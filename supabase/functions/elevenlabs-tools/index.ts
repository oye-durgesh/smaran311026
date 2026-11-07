// ElevenLabs server-tool webhook. Identity comes from the signed smaran_session, not from the model.
// Service-role access is scoped to the session owner + bound family member.

import { corsHeaders, json, serviceClient, timingSafeEqual } from '../_shared/http.ts'
import { configuredAgent, type AgentWho } from '../_shared/elevenlabs.ts'
import { verifyToolSession, type ToolAgent } from '../_shared/tool-session.ts'
import { runMedicineTool } from '../_shared/medicine-tools.ts'
import { supabaseMedicineStore } from '../_shared/medicine-store.ts'
import {
  elevenLabsToolEnvelope,
  isMedicineTool,
  logToolInvoke,
  parseElevenLabsToolBody,
  toolHttpStatus,
} from '../_shared/tools-webhook.ts'
import { logStage } from '../_shared/safe-log.ts'

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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, toolHttpStatus('bad_method'))

  const expected = (Deno.env.get('SMARAN_TOOL_SECRET') ?? '').trim()
  const got = (req.headers.get('X-Smaran-Tool-Secret') ?? req.headers.get('xi-webhook-secret') ?? '').trim()
  if (!expected || !got || !timingSafeEqual(expected, got)) {
    logToolInvoke({ tool: req.headers.get('X-Smaran-Tool-Name') ?? '', status: 401, code: 'permission_denied', succeeded: false, hasSession: false })
    return json(elevenLabsToolEnvelope('unknown', {
      ok: false, code: 'permission_denied',
      message: 'I cannot verify the current schedule right now. Please try the reminder again.',
    }), toolHttpStatus('auth'))
  }

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = parseElevenLabsToolBody(raw, req.headers.get('X-Smaran-Tool-Name') ?? '')
  const tool = isMedicineTool(parsed.tool) ? parsed.tool : null
  if (!tool) {
    logToolInvoke({ tool: parsed.tool, status: 200, code: 'invalid', succeeded: false, hasSession: false })
    return json(elevenLabsToolEnvelope(parsed.tool || 'unknown', {
      ok: false, code: 'invalid', message: 'I do not have that medicine action. Please ask about today’s medicines or this reminder.',
    }), toolHttpStatus('executed'))
  }

  const token = String(parsed.params.smaran_session ?? '')
  const claims = await verifyToolSession(expected, token)
  if (!claims) {
    logToolInvoke({
      tool, status: 200, code: 'permission_denied', succeeded: false, hasSession: false,
      confirmed: parsed.params.confirmed, minutes: parsed.params.minutes,
      occurrence: typeof parsed.params.occurrence_id === 'string',
      medicineId: typeof parsed.params.medicine_id === 'string',
    })
    return json(elevenLabsToolEnvelope(tool, {
      ok: false, code: 'permission_denied',
      message: 'I cannot verify who this call is for. Please start the reminder call again from Smaran.',
    }), toolHttpStatus('executed'))
  }

  const webhookAgent = parsed.agentId ? agentFromId(parsed.agentId) : null
  const store = supabaseMedicineStore(serviceClient())
  try {
    const result = await runMedicineTool(store, { claims, webhookAgent, now: new Date() }, tool, parsed.params)
    const body = elevenLabsToolEnvelope(tool, result)
    const inner = body.result as { succeeded?: boolean; code?: string }
    logToolInvoke({
      tool,
      status: 200,
      code: String(inner.code ?? (result.ok ? 'ok' : 'error')),
      succeeded: inner.succeeded === true,
      hasSession: true,
      confirmed: parsed.params.confirmed,
      minutes: parsed.params.minutes,
      occurrence: !!(claims.oid || parsed.params.occurrence_id),
      medicineId: typeof parsed.params.medicine_id === 'string',
    })
    return json(body, toolHttpStatus('executed'))
  } catch (e) {
    logStage('elevenlabs-tools', tool, { status: 200, error: e })
    return json(elevenLabsToolEnvelope(tool, {
      ok: false, code: 'unavailable',
      message: 'I cannot verify the current schedule right now. I have not marked it taken or snoozed.',
    }), toolHttpStatus('executed'))
  }
})
