// Structured logs for Edge Functions. Never write secrets, tokens, or signed URLs.

const REDACT = /xi-api-key|authorization|bearer\s+\S+|smaran[_-]?session|signed[_-]?url|toolsession|SMARAN_TOOL_SECRET|ELEVENLABS_API_KEY|api[_-]?key|secret|token=/gi
const JWT = /[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g
const URLS = /https?:\/\/[^\s"'\\]+/gi

export function sanitizeErrorMessage(raw: unknown): string {
  let s = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : 'error'
  s = s.replace(JWT, '[redacted]')
  s = s.replace(URLS, '[url]')
  s = s.replace(REDACT, '[redacted]')
  return s.replace(/\s+/g, ' ').trim().slice(0, 180)
}

export function logStage(scope: string, stage: string, rec: { status?: number; error?: unknown } = {}): void {
  const error = rec.error == null ? null : sanitizeErrorMessage(rec.error)
  console.error(JSON.stringify({ scope, stage, status: rec.status ?? null, error }))
}
