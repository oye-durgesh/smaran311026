// Issues a short-lived signed URL for the Mother or Father ElevenLabs agent.
// The browser sends personId and optional occurrenceId. Agent and reminder binding
// are validated against family_members / medicines (RLS). Keys never leave this function.

import { corsHeaders, json, requireUser } from '../_shared/http.ts'
import { startProfileSession } from '../_shared/elevenlabs.ts'
import { agentForRel, signToolSession } from '../_shared/tool-session.ts'
import { ensureAgentTools } from '../_shared/register-tools.ts'
import { validateCallOccurrence } from '../_shared/medicine-tools.ts'
import { supabaseMedicineStore } from '../_shared/medicine-store.ts'

const UUID_OR_LOCAL = /^[A-Za-z0-9_-]{1,64}$/
const OCCURRENCE = /^[A-Za-z0-9_.:-]{1,160}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const who = await requireUser(req)
  if (who instanceof Response) return who
  const { db } = who
  let body: Record<string, unknown> = {}
  try { body = await req.json() as Record<string, unknown> } catch { /* handled below */ }
  const personId = body.personId
  if (typeof personId !== 'string' || !UUID_OR_LOCAL.test(personId)) {
    return json({ error: 'personId is required.', code: 'bad_request' }, 400)
  }
  const occurrenceRaw = body.occurrenceId ?? body.occurrence_id
  const occurrenceId = typeof occurrenceRaw === 'string' && OCCURRENCE.test(occurrenceRaw) ? occurrenceRaw : ''

  const row = (await db.from('family_members').select('id, relationship, active').eq('id', personId).maybeSingle()).data
  const r = await startProfileSession((k) => Deno.env.get(k), {
    personId,
    lookup: async () => row,
  })
  if (!r.ok) return json(r.body, r.status)
  const rel = row?.relationship === 'father' ? 'father' : row?.relationship === 'self' ? 'self' : 'mother'
  const secret = (Deno.env.get('SMARAN_TOOL_SECRET') ?? Deno.env.get('ELEVENLABS_API_KEY') ?? '').trim()
  if (!secret) return json({ error: 'Voice conversations are not configured.', code: 'missing_credentials' }, 503)

  if (r.agent !== 'mummy' && r.agent !== 'papa') {
    return json({ error: 'Only Mother and Father have a dedicated voice agent.', code: 'no_agent_for_profile' }, 422)
  }

  const tools = await ensureAgentTools((k) => Deno.env.get(k), r.agent)
  if (!tools.ok) {
    return json({
      error: 'Medicine tools are not available for this voice agent. The call was not started.',
      code: 'tools_unavailable',
    }, 503)
  }

  let oid: string | undefined
  let reminderStatus: 'bound' | 'none' | 'stale' | 'taken' | 'invalid' = 'none'
  if (occurrenceId) {
    const check = await validateCallOccurrence(supabaseMedicineStore(db), who.user.id, r.personId, occurrenceId, new Date())
    if (check.ok) {
      oid = check.oid
      reminderStatus = 'bound'
    } else if (check.code === 'unavailable') {
      return json({ error: 'I cannot verify the current schedule right now.', code: 'unavailable' }, 503)
    } else if (check.code === 'taken') {
      reminderStatus = 'taken'
    } else if (check.code === 'permission_denied') {
      reminderStatus = 'invalid'
    } else {
      reminderStatus = 'stale'
    }
  }

  const toolSession = await signToolSession(secret, {
    uid: who.user.id,
    mid: r.personId,
    rel,
    ag: agentForRel(rel),
    ...(oid ? { oid } : {}),
  })
  return json({
    signedUrl: r.signedUrl,
    agent: r.agent,
    personId: r.personId,
    toolSession,
    reminderStatus,
    disclosure: 'Sathi is an AI companion, not a person. Medicine facts come from your Smaran records, not from memory.',
  })
})
