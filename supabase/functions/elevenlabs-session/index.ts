// Issues a short-lived signed URL for the Mother or Father ElevenLabs agent.
// The browser sends personId and optional occurrenceId. Agent and reminder binding
// are validated against family_members / medicines (RLS). Keys never leave this function.

import { corsHeaders, json, requireUser } from '../_shared/http.ts'
import { issueElevenLabsSession } from '../_shared/issue-session.ts'
import { supabaseMedicineStore } from '../_shared/medicine-store.ts'
import { logStage } from '../_shared/safe-log.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const who = await requireUser(req)
    if (who instanceof Response) return who
    const { db, user } = who
    let body: Record<string, unknown> = {}
    try { body = await req.json() as Record<string, unknown> } catch { /* handled below */ }
    const result = await issueElevenLabsSession({
      env: (k) => Deno.env.get(k),
      userId: user.id,
      personId: body.personId,
      occurrenceId: body.occurrenceId ?? body.occurrence_id,
      lookup: async (personId) =>
        (await db.from('family_members').select('id, relationship, active').eq('id', personId).maybeSingle()).data,
      store: supabaseMedicineStore(db),
    })
    if (result.status >= 400) {
      logStage('elevenlabs-session', String(result.body.stage ?? 'issue'), { status: result.status, error: result.body.code })
    }
    return json(result.body, result.status)
  } catch (e) {
    logStage('elevenlabs-session', 'unhandled', { status: 503, error: e })
    return json({ error: 'The voice session could not be created.', code: 'session_failed', stage: 'unhandled' }, 503)
  }
})
