// Orchestrates a prescription-reading job: validate → submit Extract → poll status → GET results (or Parse ZIP if configured) → map to drafts.
// Used by the Supabase Edge Functions and by the local dev server. Pure of Deno/Node globals so it is unit-testable.
import type { ErrorCode, ExtractionJob, ExtractionOutput, JobStore, SarvamState } from './extraction-types.ts'
import { DOC_LANGUAGES, isDocLanguage, validateUpload } from './extraction-types.ts'
import { SarvamDocAi, SarvamError } from './sarvam.ts'
import { OutputError, primaryToText, readPrimaryFile, type Unzip } from './ocr-output.ts'
import { parsePrescriptionText } from './prescription-parser.ts'
import { mapExtractResult, toExtractionOutput } from './extract-mapper.ts'

export interface ServiceDeps {
  sarvam: SarvamDocAi
  jobs: JobStore
  unzip: Unzip
  now?: () => Date
  newId?: () => string
  outputFormat?: 'md' | 'html' | 'json'
  /** A job that has not reached a terminal state after this long is marked timed_out. */
  maxJobAgeMs?: number
}

const TERMINAL = new Set(['completed', 'partially_completed', 'failed', 'rejected', 'cancelled', 'timed_out'])
export const isTerminal = (s: string) => TERMINAL.has(s)

const nowOf = (d: ServiceDeps) => (d.now ?? (() => new Date()))()
const idOf = (d: ServiceDeps) => (d.newId ?? (() => `xj_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`))()

export class ServiceError extends Error {
  code: ErrorCode
  retryAfterSec?: number
  status: number
  constructor(code: ErrorCode, message: string, status = 400, retryAfterSec?: number) { super(message); this.code = code; this.status = status; this.retryAfterSec = retryAfterSec }
}

export interface SubmitInput { ownerId: string; file: Blob; fileName: string; mime: string; size: number; language: string }

export async function submitExtraction(d: ServiceDeps, i: SubmitInput): Promise<ExtractionJob> {
  const bad = validateUpload({ name: i.fileName, type: i.mime, size: i.size })
  if (bad) throw new ServiceError(bad.code, bad.message, bad.code === 'too_large' ? 413 : 415)
  if (!isDocLanguage(i.language)) throw new ServiceError('bad_request', `Unsupported document language. Use one of: ${DOC_LANGUAGES.map((l) => l.code).join(', ')}.`, 400)
  const t = nowOf(d).toISOString()
  const fmt = d.outputFormat ?? (d.sarvam.usesExtract ? 'json' : 'md')
  const job: ExtractionJob = {
    id: idOf(d), ownerId: i.ownerId, provider: 'sarvam', sarvamJobId: null, fileName: i.fileName, mime: i.mime, size: i.size,
    language: i.language, outputFormat: fmt, status: 'submitted', createdAt: t, updatedAt: t,
  }
  await d.jobs.create(job)
  try {
    const { jobId } = await d.sarvam.submit(i.file, i.fileName, i.language, fmt)
    return await d.jobs.update(job.id, { sarvamJobId: jobId, status: 'submitted' })
  } catch (e) {
    const err = e instanceof SarvamError ? e : new SarvamError('failed', 'Could not start reading the prescription.')
    await d.jobs.update(job.id, { status: 'failed', errorCode: err.code, errorMessage: err.message, retryAfterSec: err.retryAfterSec })
    throw new ServiceError(err.code, err.message, err.status || 502, err.retryAfterSec)
  }
}

/** One step of progress. Safe to call repeatedly; terminal jobs are returned untouched. */
export async function advanceExtraction(d: ServiceDeps, id: string, ownerId: string): Promise<ExtractionJob> {
  const job = await d.jobs.get(id, ownerId)
  if (!job) throw new ServiceError('not_found', 'That reading job does not exist.', 404)
  if (isTerminal(job.status) || !job.sarvamJobId) return job
  const age = nowOf(d).getTime() - new Date(job.createdAt).getTime()
  if (age > (d.maxJobAgeMs ?? 10 * 60_000)) {
    return d.jobs.update(id, { status: 'timed_out', errorCode: 'timeout', errorMessage: 'Reading took too long. Please try again.' })
  }

  let st
  try { st = await d.sarvam.status(job.sarvamJobId) } catch (e) {
    const err = e instanceof SarvamError ? e : null
    // rate limits and brief outages do not fail the job: the client keeps polling with backoff
    if (err && (err.code === 'rate_limit' || err.code === 'unavailable')) return d.jobs.update(id, { retryAfterSec: err.retryAfterSec ?? 5 })
    if (err?.code === 'not_found') return d.jobs.update(id, { status: 'failed', errorCode: 'not_found', errorMessage: err.message })
    throw new ServiceError(err?.code ?? 'failed', err?.message ?? 'Could not check the reading job.', err?.status || 502)
  }
  const pages = { total: st.pages.total, processed: st.pages.processed, succeeded: st.pages.succeeded, failed: st.pages.failed }
  const state: SarvamState = st.state
  if (state === 'pending' || state === 'running') return d.jobs.update(id, { status: 'running', pages, retryAfterSec: undefined })
  if (state === 'failed') return d.jobs.update(id, { status: 'failed', pages, errorCode: 'failed', errorMessage: "The prescription couldn't be read. Try a clearer photo or add medicines manually." })
  if (state === 'rejected') return d.jobs.update(id, { status: 'rejected', pages, errorCode: 'rejected', errorMessage: 'The prescription reader rejected this document (check the file type, page count and your account access).' })

  // completed / partially_completed → fetch Extract JSON (or Parse ZIP if SARVAM_DOC_JOB_PATH=parse)
  try {
    let result: ExtractionOutput
    if (d.sarvam.usesExtract) {
      const out = await d.sarvam.getResults(job.sarvamJobId)
      const mapped = mapExtractResult({ result: out.result, annotations: out.annotations, pages, partial: state === 'partially_completed' })
      result = toExtractionOutput(mapped, { partial: state === 'partially_completed', pages: { total: pages.total, succeeded: pages.succeeded, failed: pages.failed } })
    } else {
      const zip = await d.sarvam.downloadZip(job.sarvamJobId)
      const primary = readPrimaryFile(zip, d.unzip, job.outputFormat)
      const rawText = primaryToText(primary)
      const parsed = parsePrescriptionText(rawText)
      const warnings = [...parsed.warnings]
      if (state === 'partially_completed') warnings.push(`${pages.failed || 'Some'} page${pages.failed === 1 ? '' : 's'} could not be read, so some medicines may be missing.`)
      const partial = state === 'partially_completed' || parsed.medicines.some((m) => m.lowConfidence)
      result = {
        provider: 'sarvam', isMock: false, outcome: partial ? 'partial' : 'success', rawText, rawFormat: primary.format,
        medicines: parsed.medicines, otherInstructions: parsed.otherInstructions, warnings, pages: { total: pages.total, succeeded: pages.succeeded, failed: pages.failed },
      }
    }
    if (result.medicines.length === 0) {
      return d.jobs.update(id, { status: 'failed', pages, result, errorCode: 'no_medicines', errorMessage: "We read the document but couldn't find any medicines in it. You can compare the text or add medicines manually." })
    }
    return d.jobs.update(id, { status: state, pages, result, retryAfterSec: undefined })
  } catch (e) {
    if (e instanceof OutputError) return d.jobs.update(id, { status: 'failed', pages, errorCode: e.code, errorMessage: e.message })
    if (e instanceof SarvamError) {
      if (e.code === 'rate_limit' || e.code === 'unavailable') return d.jobs.update(id, { retryAfterSec: e.retryAfterSec ?? 5 })
      return d.jobs.update(id, { status: 'failed', pages, errorCode: e.code, errorMessage: e.message })
    }
    throw e
  }
}

/** Sarvam documents no cancel endpoint: we stop tracking the job and ignore its output. */
export async function cancelExtraction(d: ServiceDeps, id: string, ownerId: string): Promise<ExtractionJob> {
  const job = await d.jobs.get(id, ownerId)
  if (!job) throw new ServiceError('not_found', 'That reading job does not exist.', 404)
  if (isTerminal(job.status)) return job
  return d.jobs.update(id, { status: 'cancelled', errorCode: 'cancelled', errorMessage: 'Cancelled.' })
}

export function memoryJobStore(): JobStore & { all(): ExtractionJob[] } {
  const m = new Map<string, ExtractionJob>()
  return {
    async create(j) { m.set(j.id, { ...j }) },
    async get(id, ownerId) { const j = m.get(id); return j && j.ownerId === ownerId ? { ...j } : null },
    async update(id, patch) {
      const cur = m.get(id)
      if (!cur) throw new Error('job missing')
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }
      m.set(id, next)
      return { ...next }
    },
    all: () => [...m.values()],
  }
}

/** What the browser may see (never the owner id or the Sarvam job id). */
export function publicJob(j: ExtractionJob) {
  const { ownerId: _o, sarvamJobId: _s, ...rest } = j
  void _o; void _s
  return rest
}
