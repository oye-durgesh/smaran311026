// Issues a short-lived signed URL for the Mother or Father ElevenLabs agent.
// The browser sends only personId. Agent selection comes from family_members.relationship (RLS).
// ELEVENLABS_API_KEY never leaves this function.

import { corsHeaders, json, requireUser } from '../_shared/http.ts'
import { startProfileSession } from '../_shared/elevenlabs.ts'
import { agentForRel, signToolSession } from '../_shared/tool-session.ts'
import { ensureAgentTools } from '../_shared/register-tools.ts'

const UUID_OR_LOCAL = /^[A-Za-z0-9_-]{1,64}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const who = await requireUser(req)
  if (who instanceof Response) return who
  const { db } = who
  let personId: unknown
  try { personId = (await req.json()).personId } catch { /* handled below */ }
  if (typeof personId !== 'string' || !UUID_OR_LOCAL.test(personId)) {
    return json({ error: 'personId is required.', code: 'bad_request' }, 400)
  }
  const row = (await db.from('family_members').select('id, relationship, active').eq('id', personId).maybeSingle()).data
  const r = await startProfileSession((k) => Deno.env.get(k), {
    personId,
    lookup: async () => row,
  })
  if (!r.ok) return json(r.body, r.status)
  const rel = row?.relationship === 'father' ? 'father' : row?.relationship === 'self' ? 'self' : 'mother'
  const secret = (Deno.env.get('SMARAN_TOOL_SECRET') ?? Deno.env.get('ELEVENLABS_API_KEY') ?? '').trim()
  if (!secret) return json({ error: 'Voice conversations are not configured.', code: 'missing_credentials' }, 503)
  const toolSession = await signToolSession(secret, {
    uid: who.user.id,
    mid: r.personId,
    rel,
    ag: agentForRel(rel),
  })
  if (r.agent === 'mummy' || r.agent === 'papa') {
    void ensureAgentTools((k) => Deno.env.get(k), r.agent).catch(() => undefined)
  }
  return json({
    signedUrl: r.signedUrl,
    agent: r.agent,
    personId: r.personId,
    toolSession,
    disclosure: 'Sathi is an AI companion, not a person. Medicine facts come from your Smaran records, not from memory.',
  })
})
