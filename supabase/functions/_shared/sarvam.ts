// Sarvam Document Intelligence client. Default operation is Extract (not Parse / digitise):
//   POST {base}/doc-ai/v1/job/extract   multipart: file, schema (JSON string), language (BCP-47), output_format=json; header api-subscription-key
//   GET  {base}/doc-ai/v1/job/{id}/status
//   GET  {base}/doc-ai/v1/job/{id}/results  → { result, annotations, usage, status }
// Optional SARVAM_DOC_JOB_PATH=parse keeps the older ZIP download path for accounts that still use Parse.
import type { ErrorCode, SarvamState } from './extraction-types.ts'
import { PRESCRIPTION_EXTRACT_SCHEMA } from './prescription-schema.ts'

export class SarvamError extends Error {
  code: ErrorCode
  status: number
  retryAfterSec?: number
  constructor(code: ErrorCode, message: string, status = 0, retryAfterSec?: number) {
    super(message)
    this.code = code
    this.status = status
    this.retryAfterSec = retryAfterSec
  }
}

export interface SarvamDeps {
  apiKey: string | undefined
  baseUrl?: string
  jobPath?: string // default "extract"
  fetch?: typeof fetch
}

export interface SarvamStatus {
  state: SarvamState
  pages: { total: number; processed: number; succeeded: number; failed: number }
  raw: Record<string, unknown>
}

export interface ExtractResults {
  status: SarvamState
  result: unknown
  annotations: unknown
  pages: { total: number; processed: number; succeeded: number; failed: number }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Map an HTTP failure to a user-meaningful error. The response body is never logged (it may echo document text). */
export function errorFromResponse(status: number, body: string, headers?: Headers): SarvamError {
  const retry = Number(headers?.get('retry-after'))
  const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : undefined
  const detail = body.toLowerCase()
  if (status === 429) return new SarvamError('rate_limit', 'The prescription reader is busy right now. Please wait a minute and try again.', status, retryAfter ?? 30)
  if (status === 401) return new SarvamError('auth', 'The prescription reader rejected the server credentials.', status)
  if (status === 402 || status === 403) return new SarvamError('billing', 'The prescription reader is not available for this account (billing or access). Please contact the administrator.', status)
  if (status === 413) return new SarvamError('too_large', 'This file is too large for the prescription reader.', status)
  if (status === 404) return new SarvamError('not_found', 'The reading job could not be found.', status)
  if (status === 409) return new SarvamError('unavailable', 'The reading results are not ready yet.', status, retryAfter ?? 3)
  if (status === 422) return new SarvamError('invalid_file', "This file couldn't be opened. It may be damaged or not a supported format.", status)
  if (status === 400) {
    if (/page|limit/.test(detail)) return new SarvamError('too_many_pages', 'This document has too many pages (the limit is 20). Please upload fewer pages.', status)
    return new SarvamError('bad_request', 'The prescription reader could not accept this request.', status)
  }
  if (status >= 500) return new SarvamError('unavailable', 'The prescription reader is temporarily unavailable. Please try again shortly.', status, retryAfter)
  return new SarvamError('failed', `The prescription reader returned an unexpected error (${status}).`, status)
}

export class SarvamDocAi {
  private key: string
  private base: string
  readonly path: string
  private f: typeof fetch

  constructor(d: SarvamDeps) {
    if (!d.apiKey) throw new SarvamError('missing_credentials', 'Prescription reading is not configured on the server (SARVAM_API_KEY is missing).', 0)
    this.key = d.apiKey
    this.base = (d.baseUrl ?? 'https://api.sarvam.ai').replace(/\/$/, '')
    this.path = (d.jobPath ?? 'extract').replace(/^\/|\/$/g, '')
    this.f = d.fetch ?? fetch
  }

  get usesExtract(): boolean { return this.path === 'extract' }

  private async req(url: string, init: RequestInit = {}): Promise<Response> {
    let res: Response
    try {
      res = await this.f(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), 'api-subscription-key': this.key } })
    } catch {
      throw new SarvamError('unavailable', 'Could not reach the prescription reader. Check the connection and try again.', 0)
    }
    if (!res.ok) throw errorFromResponse(res.status, await res.text().catch(() => ''), res.headers)
    return res
  }

  /** Create the job. Returns Sarvam's job id. */
  async submit(file: Blob, fileName: string, language: string, outputFormat: 'md' | 'html' | 'json' = 'json'): Promise<{ jobId: string; state: SarvamState }> {
    const form = new FormData()
    form.append('file', file, fileName)
    form.append('language', language)
    if (this.usesExtract) {
      form.append('schema', JSON.stringify(PRESCRIPTION_EXTRACT_SCHEMA))
      form.append('output_format', 'json')
    } else {
      form.append('output_format', outputFormat)
    }
    const res = await this.req(`${this.base}/doc-ai/v1/job/${this.path}`, { method: 'POST', body: form })
    const j = (await res.json().catch(() => ({}))) as { job_id?: string; status?: string }
    if (!j.job_id) throw new SarvamError('failed', 'The prescription reader did not return a job id.', res.status)
    return { jobId: j.job_id, state: normState(j.status) }
  }

  async status(jobId: string): Promise<SarvamStatus> {
    const res = await this.req(`${this.base}/doc-ai/v1/job/${encodeURIComponent(jobId)}/status`)
    const j = (await res.json().catch(() => ({}))) as { status?: string; usage?: Record<string, unknown> }
    const u = j.usage ?? {}
    return {
      state: normState(j.status),
      pages: { total: num(u.pages_total), processed: num(u.pages_processed), succeeded: num(u.pages_succeeded), failed: num(u.pages_failed) },
      raw: j as Record<string, unknown>,
    }
  }

  /** Extract: structured fields + per-leaf confidence. Must not be called until the job is terminal. */
  async getResults(jobId: string): Promise<ExtractResults> {
    const res = await this.req(`${this.base}/doc-ai/v1/job/${encodeURIComponent(jobId)}/results?format=json`)
    const j = (await res.json().catch(() => ({}))) as { status?: string; result?: unknown; annotations?: unknown; usage?: Record<string, unknown> }
    const u = j.usage ?? {}
    return {
      status: normState(j.status),
      result: j.result ?? {},
      annotations: j.annotations ?? {},
      pages: { total: num(u.pages_total), processed: num(u.pages_processed), succeeded: num(u.pages_succeeded), failed: num(u.pages_failed) },
    }
  }

  /** Parse ZIP. The pre-signed URL is a plain GET and must NOT receive the API key. */
  async downloadZip(jobId: string): Promise<Uint8Array> {
    const res = await this.req(`${this.base}/doc-ai/v1/job/${encodeURIComponent(jobId)}/download-url`)
    const j = (await res.json().catch(() => ({}))) as { url?: string }
    if (!j.url) throw new SarvamError('no_output', 'The prescription reader returned no output file.', res.status)
    let dl: Response
    try { dl = await this.f(j.url) } catch { throw new SarvamError('unavailable', 'Could not download the reader output.', 0) }
    if (!dl.ok) throw errorFromResponse(dl.status, '', dl.headers)
    return new Uint8Array(await dl.arrayBuffer())
  }
}

function normState(s: unknown): SarvamState {
  const v = String(s ?? '').toLowerCase()
  return (['pending', 'running', 'completed', 'partially_completed', 'failed', 'rejected'] as const).includes(v as SarvamState) ? (v as SarvamState) : v === 'accepted' || v === 'queued' ? 'pending' : 'running'
}
