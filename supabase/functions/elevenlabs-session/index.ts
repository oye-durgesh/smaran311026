// Issues a short-lived signed URL for the Mother or Father ElevenLabs agent.
// The browser sends only personId. Agent selection comes from family_members.relationship (RLS).
// ELEVENLABS_API_KEY never leaves this function.

import { corsHeaders, json, requireUser } from '../_shared/http.ts'
import { startProfileSession } from '../_shared/elevenlabs.ts'

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
  const r = await startProfileSession((k) => Deno.env.get(k), {
    personId,
    lookup: async (id) => (await db.from('family_members').select('id, relationship, active').eq('id', id).maybeSingle()).data,
  })
  if (!r.ok) return json(r.body, r.status)
  return json({ signedUrl: r.signedUrl, agent: r.agent, personId: r.personId, disclosure: 'Sathi is an AI companion, not a person.' })
})
