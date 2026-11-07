// ElevenLabs ConvAI webhook adapter. Never logs secrets or smaran_session values.

import type { ToolResult } from './medicine-tools.ts'
import { MEDICINE_TOOL_NAMES, type ToolName } from './medicine-tools.ts'
import { logStage } from './safe-log.ts'

export type ParsedToolCall = {
  tool: string
  params: Record<string, unknown>
  agentId: string
  conversationId: string
  toolCallId: string
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k]
  }
  return undefined
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
}

export function parseElevenLabsToolBody(raw: unknown, headerTool = ''): ParsedToolCall {
  const b = asRecord(raw)
  const nested = asRecord(b.parameters ?? b.params ?? b.tool_call)
  const inner = asRecord(nested.parameters ?? nested.params)
  const dyn = asRecord(b.dynamic_variables ?? nested.dynamic_variables)
  const params = { ...b, ...nested, ...inner, ...dyn }
  const session = pick(params, ['smaran_session', 'session']) ?? pick(dyn, ['smaran_session'])
  if (session != null) params.smaran_session = session
  const tool = String(
    headerTool
    || pick(b, ['tool_name', 'name', 'tool'])
    || pick(nested, ['tool_name', 'name', 'tool'])
    || '',
  )
  return {
    tool,
    params,
    agentId: String(pick(b, ['agent_id', 'agentId']) ?? pick(nested, ['agent_id', 'agentId']) ?? ''),
    conversationId: String(pick(b, ['conversation_id', 'conversationId']) ?? ''),
    toolCallId: String(pick(b, ['tool_call_id', 'toolCallId']) ?? ''),
  }
}

export const isMedicineTool = (n: string): n is ToolName => (MEDICINE_TOOL_NAMES as string[]).includes(n)

function speakable(result: ToolResult): string {
  if ('message' in result && typeof result.message === 'string' && result.message.trim()) return result.message
  if (result.ok) return 'Use only the records in this tool result. Do not invent medicines or times.'
  return 'I cannot verify the current schedule right now. I have not changed the reminder.'
}

/** Envelope ElevenLabs reads. `result.succeeded` is the only success signal for the agent. */
export function elevenLabsToolEnvelope(tool: string, result: ToolResult): Record<string, unknown> {
  const succeeded = result.ok === true
  const message = speakable(result)
  const { ok: _ok, ...rest } = result
  return {
    result: {
      ...rest,
      ok: succeeded,
      succeeded,
      tool,
      code: succeeded ? 'ok' : ('code' in result ? result.code : 'unavailable'),
      message,
      speak: message,
    },
  }
}

export function toolHttpStatus(kind: 'auth' | 'bad_method' | 'executed'): number {
  if (kind === 'auth') return 401
  if (kind === 'bad_method') return 405
  return 200
}

export function logToolInvoke(rec: {
  tool: string
  status: number
  code: string
  succeeded: boolean
  hasSession: boolean
  minutes?: unknown
  confirmed?: unknown
  occurrence?: boolean
  medicineId?: boolean
}): void {
  logStage('elevenlabs-tools', rec.tool || 'unknown_tool', {
    status: rec.status,
    error: `${rec.code} succeeded=${rec.succeeded} session=${rec.hasSession ? 'yes' : 'no'} confirmed=${String(rec.confirmed ?? '')} minutes=${String(rec.minutes ?? '')} occurrence=${rec.occurrence ? 'yes' : 'no'} medicine_id=${rec.medicineId ? 'yes' : 'no'}`,
  })
}
