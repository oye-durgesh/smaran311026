// Authenticated Mother/Father voice session. Tools are registered before a signed URL is issued.

import type { Env } from './elevenlabs.ts'
import { agentForRelationship, startProfileSession, type ProfileRow } from './elevenlabs.ts'
import { agentForRel, signToolSession } from './tool-session.ts'
import { ensureAgentTools, type EnsureToolsResult } from './register-tools.ts'
import { validateCallOccurrence, type MedicineStore } from './medicine-tools.ts'
import { logStage, sanitizeErrorMessage } from './safe-log.ts'

const UUID_OR_LOCAL = /^[A-Za-z0-9_-]{1,64}$/
const OCCURRENCE = /^[A-Za-z0-9_.:-]{1,160}$/

export type SessionResult = { status: number; body: Record<string, unknown> }

function toolsHttp(r: EnsureToolsResult): SessionResult {
  const err = r.error ?? 'tools_unavailable'
  const stage = r.stage ?? 'ensure_tools'
  if (err === 'not_configured') {
    return { status: 503, body: { error: 'Voice conversations are not configured.', code: 'not_configured', stage } }
  }
  if (err === 'missing_tool_secret') {
    return {
      status: 503,
      body: { error: 'Medicine tools are not configured (SMARAN_TOOL_SECRET is missing).', code: 'missing_tool_secret', stage },
    }
  }
  if (/_401$|_403$/.test(err) || err === 'auth') {
    return { status: 502, body: { error: 'ElevenLabs rejected ELEVENLABS_API_KEY.', code: 'auth', stage } }
  }
  if (err.startsWith('tool_patch_')) {
    return {
      status: 502,
      body: { error: 'ElevenLabs rejected a medicine-tool update. The call was not started.', code: 'tools_patch_failed', stage },
    }
  }
  if (err.startsWith('tool_create_')) {
    return {
      status: 502,
      body: { error: 'ElevenLabs rejected medicine-tool creation. The call was not started.', code: 'tools_create_failed', stage },
    }
  }
  if (err.startsWith('tools_list_')) {
    return {
      status: 502,
      body: { error: 'ElevenLabs tool list failed. The call was not started.', code: 'tools_list_failed', stage },
    }
  }
  if (err.startsWith('agent_')) {
    return {
      status: 502,
      body: { error: 'The voice agent could not be updated with medicine tools. The call was not started.', code: 'agent_update_failed', stage },
    }
  }
  return {
    status: 503,
    body: { error: 'Medicine tools are not available for this voice agent. The call was not started.', code: 'tools_unavailable', stage },
  }
}

export async function issueElevenLabsSession(input: {
  env: Env
  userId: string
  personId: unknown
  occurrenceId?: unknown
  lookup: (personId: string) => Promise<ProfileRow | null | undefined>
  store: MedicineStore
  fetch?: typeof fetch
  now?: Date
}): Promise<SessionResult> {
  const personId = input.personId
  if (typeof personId !== 'string' || !UUID_OR_LOCAL.test(personId)) {
    return { status: 400, body: { error: 'personId is required.', code: 'bad_request', stage: 'validate_person' } }
  }
  const occurrenceRaw = input.occurrenceId
  const occurrenceId = typeof occurrenceRaw === 'string' && OCCURRENCE.test(occurrenceRaw) ? occurrenceRaw : ''

  try {
    const row = await input.lookup(personId)
    const who = agentForRelationship(row?.relationship)
    if (row && !who) {
      return { status: 422, body: { error: 'Only Mother and Father have a dedicated voice agent.', code: 'no_agent_for_profile', stage: 'resolve_agent' } }
    }

    const secret = (input.env('SMARAN_TOOL_SECRET') ?? '').trim()
    if (!secret) {
      logStage('elevenlabs-session', 'missing_tool_secret', { status: 503 })
      return toolsHttp({ ok: false, hardcoded: false, error: 'missing_tool_secret', stage: 'secrets' })
    }
    if (!(input.env('ELEVENLABS_API_KEY') ?? '').trim()) {
      logStage('elevenlabs-session', 'missing_api_key', { status: 503 })
      return { status: 503, body: { error: 'Voice conversations are not configured.', code: 'missing_credentials', stage: 'secrets' } }
    }

    if (who) {
      const tools = await ensureAgentTools(input.env, who, input.fetch ?? fetch)
      if (!tools.ok) {
        logStage('elevenlabs-session', tools.stage ?? 'ensure_tools', { status: tools.status ?? 503, error: tools.error })
        return toolsHttp(tools)
      }
    }

    const r = await startProfileSession(input.env, { personId, lookup: async () => row }, input.fetch ?? fetch)
    if (!r.ok) {
      logStage('elevenlabs-session', 'signed_url', { status: r.status, error: r.body.code })
      return { status: r.status, body: { ...r.body, stage: 'signed_url' } }
    }
    if (r.agent !== 'mummy' && r.agent !== 'papa') {
      return { status: 422, body: { error: 'Only Mother and Father have a dedicated voice agent.', code: 'no_agent_for_profile', stage: 'resolve_agent' } }
    }

    const rel = row?.relationship === 'father' ? 'father' : row?.relationship === 'self' ? 'self' : 'mother'
    let oid: string | undefined
    let reminderStatus: 'bound' | 'none' | 'stale' | 'taken' | 'invalid' = 'none'
    if (occurrenceId) {
      const check = await validateCallOccurrence(input.store, input.userId, r.personId, occurrenceId, input.now ?? new Date())
      if (check.ok) {
        oid = check.oid
        reminderStatus = 'bound'
      } else if (check.code === 'unavailable') {
        return { status: 503, body: { error: 'I cannot verify the current schedule right now.', code: 'unavailable', stage: 'occurrence' } }
      } else if (check.code === 'taken') {
        reminderStatus = 'taken'
      } else if (check.code === 'permission_denied') {
        reminderStatus = 'invalid'
      } else {
        reminderStatus = 'stale'
      }
    }

    const toolSession = await signToolSession(secret, {
      uid: input.userId,
      mid: r.personId,
      rel,
      ag: agentForRel(rel),
      ...(oid ? { oid } : {}),
    })
    return {
      status: 200,
      body: {
        signedUrl: r.signedUrl,
        agent: r.agent,
        personId: r.personId,
        toolSession,
        reminderStatus,
        disclosure: 'Sathi is an AI companion, not a person. Medicine facts come from your Smaran records, not from memory.',
      },
    }
  } catch (e) {
    logStage('elevenlabs-session', 'unhandled', { status: 503, error: e })
    return {
      status: 503,
      body: {
        error: 'The voice session could not be created.',
        code: 'session_failed',
        stage: 'unhandled',
        detail: sanitizeErrorMessage(e),
      },
    }
  }
}
