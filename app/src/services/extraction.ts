import type { Food, Frequency, Medicine, TimeOfDay } from '../domain/types'
import { newId } from '../domain/ids'
import { computeFlags } from '../domain/medicines'
import { store, now } from '../store/store'
import { SMARAN_MAX_BYTES, validateUpload } from '../../../supabase/functions/_shared/extraction-types.ts'
import type { ErrorCode, ExtractedMedicine, ExtractionJob, ExtractionOutput, MedFlagName } from '../../../supabase/functions/_shared/extraction-types.ts'

export { DOC_LANGUAGES, appLangToDoc, isDocLanguage } from '../../../supabase/functions/_shared/extraction-types.ts'
export type { ExtractedMedicine, ErrorCode }
export const MAX_BYTES = SMARAN_MAX_BYTES

/** One validator shared with the server: PDF / PNG / JPG, non-empty, ≤ 10 MB. Returns a message or null. */
export function validatePrescriptionFile(f: { name: string; type: string; size: number }): string | null {
  return validateUpload(f)?.message ?? null
}

export interface ExtractionResult {
  provider: 'mock' | 'sarvam'
  isMock: boolean
  rawText: string
  rawFormat?: 'md' | 'html' | 'json'
  outcome: 'success' | 'partial'
  medicines: ExtractedMedicine[]
  otherInstructions: string[]
  warnings: string[]
  jobId?: string
  language?: string
  document?: { patientName: string; doctorName: string; prescriptionDate: string }
}

export class ExtractionError extends Error {
  rawText?: string
  jobId?: string
  constructor(message: string, readonly code: ErrorCode | 'unreadable' | 'network' | 'server' | 'duplicate_upload' | 'permission_denied' | 'not_signed_in', readonly retryable = false) { super(message) }
}

export interface ExtractOptions {
  name: string
  mime: string
  language: string
  /** The family member this document belongs to. Required for the server upload; the server re-checks it belongs to the signed-in account. */
  personId?: string
  documentType?: string
  signal?: AbortSignal
  onProgress?: (p: { status: string; pages?: ExtractionJob['pages']; jobId?: string }) => void
}

/** Service boundary: swap the implementation without touching any screen. */
export interface PrescriptionExtractor {
  id: 'mock' | 'sarvam'
  extract(file: Blob, opts: ExtractOptions): Promise<ExtractionResult>
}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  if (signal?.aborted) return rej(new ExtractionError('Cancelled.', 'cancelled'))
  const t = setTimeout(res, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new ExtractionError('Cancelled.', 'cancelled')) }, { once: true })
})

/** Messages shown to the user per error code. Never exposes provider internals. */
export function messageFor(code: string, fallback?: string): string {
  switch (code) {
    case 'missing_credentials': return 'Prescription reading is not set up on the server yet (the Sarvam API key is missing). You can add your medicines manually.'
    case 'rate_limit': return 'The reading service is busy right now. Please wait a minute and try again.'
    case 'timeout': case 'timed_out': return 'Reading is taking longer than expected. Please try again, or add your medicines manually.'
    case 'too_many_pages': return 'This document has too many pages. Please upload up to 20 pages.'
    case 'unsupported_type': case 'invalid_file': case 'too_large': return fallback ?? 'This file cannot be used. Please choose a PDF, PNG or JPG up to 10 MB.'
    case 'rejected': return 'The reading service could not accept this document. Try a clearer photo or a different file.'
    case 'no_medicines': return 'We read the document but could not find any medicines in it. You can compare the text we read, or add medicines manually.'
    case 'no_output': return 'The reading service returned no text for this document.'
    case 'auth': case 'billing': return 'Prescription reading is unavailable because of a server configuration problem.'
    case 'not_signed_in': return 'Sign in to read your prescription. Sample medicines are not used.'
    case 'unavailable': return 'The reading service is temporarily unavailable. Please try again shortly.'
    case 'network': return 'Could not reach the server. Check your connection and try again.'
    case 'cancelled': return 'Reading was cancelled.'
    case 'duplicate_upload': return 'This file was already uploaded for this person. Open their page to see it, or choose a different file.'
    case 'permission_denied': return 'You do not have permission to upload for this person.'
    case 'failed': return fallback ?? 'The document could not be read. Try a clearer photo or add medicines manually.'
    default: return fallback ?? 'Something went wrong while reading the prescription.'
  }
}
const RETRYABLE = ['rate_limit', 'timeout', 'timed_out', 'unavailable', 'network', 'server', 'failed', 'rejected', 'unreadable']

export interface Transport {
  submit(file: Blob, name: string, language: string, signal?: AbortSignal, meta?: { personId?: string; documentType?: string }): Promise<ExtractionJob>
  status(id: string, signal?: AbortSignal): Promise<ExtractionJob>
  cancel(id: string): Promise<void>
}

async function readJson(res: Response): Promise<any> {
  let body: any = null
  try { body = await res.json() } catch { /* not json */ }
  if (!res.ok) {
    const code = body?.code ?? (res.status === 429 ? 'rate_limit' : res.status >= 500 ? 'unavailable' : 'failed')
    throw new ExtractionError(messageFor(code, body?.error), code, RETRYABLE.includes(code))
  }
  return body
}
const netErr = (e: unknown) => (e instanceof ExtractionError ? e : (e as Error)?.name === 'AbortError'
  ? new ExtractionError('Cancelled.', 'cancelled') : new ExtractionError(messageFor('network'), 'network', true))

async function backendErr(e: unknown): Promise<ExtractionError> {
  const { BackendError } = await import('./backend')
  if (e instanceof BackendError) {
    const code = e.code === 'duplicate_upload' || e.code === 'permission_denied' ? e.code : e.status === 503 ? 'missing_credentials' : e.status === 429 ? 'rate_limit' : e.status === 413 ? 'too_large' : e.status === 415 ? 'unsupported_type' : e.status === 0 ? 'network' : 'unavailable'
    return new ExtractionError(messageFor(code, e.message), code, RETRYABLE.includes(code))
  }
  return netErr(e)
}

/** Supabase Edge Functions (signed-in user, RLS-protected job rows). */
export const supabaseTransport: Transport = {
  async submit(file, name, language, _signal, meta) {
    const { callFunction } = await import('./backend')
    const form = new FormData()
    form.append('file', file, name)
    form.append('language', language)
    if (meta?.personId) form.append('personId', meta.personId)
    form.append('documentType', meta?.documentType ?? 'prescription')
    try { return (await callFunction<{ job: ExtractionJob }>('extract-prescription', form)).job } catch (e) { throw await backendErr(e) }
  },
  async status(id) {
    const { callFunction } = await import('./backend')
    try { return (await callFunction<{ job: ExtractionJob }>('extraction-job', { action: 'status', jobId: id })).job } catch (e) { throw await backendErr(e) }
  },
  async cancel(id) {
    const { callFunction } = await import('./backend')
    await callFunction('extraction-job', { action: 'cancel', jobId: id }).catch(() => undefined)
  },
}

/** Local development API (npm run dev:api): same server code, in-memory jobs, key from app/.env.server.local. */
export const localTransport: Transport = {
  async submit(file, name, language, signal) {
    const form = new FormData()
    form.append('file', file, name)
    form.append('language', language)
    try { return (await readJson(await fetch('/api/extract', { method: 'POST', body: form, signal }))).job } catch (e) { throw netErr(e) }
  },
  async status(id, signal) {
    try { return (await readJson(await fetch('/api/extraction-job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', jobId: id }), signal }))).job } catch (e) { throw netErr(e) }
  },
  async cancel(id) {
    await fetch('/api/extraction-job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', jobId: id }) }).catch(() => undefined)
  },
}

export interface PollConfig { maxMs: number; firstDelayMs: number; maxDelayMs: number }
export const DEFAULT_POLL: PollConfig = { maxMs: 150_000, firstDelayMs: 1500, maxDelayMs: 8000 }

/** Submit, then poll with exponential backoff up to a bounded time. Exported for tests. */
export async function runJob(t: Transport, file: Blob, o: ExtractOptions, cfg: PollConfig = DEFAULT_POLL, sleep: (ms: number, s?: AbortSignal) => Promise<void> = wait): Promise<ExtractionResult> {
  let job = await t.submit(file, o.name, o.language, o.signal, { personId: o.personId, documentType: o.documentType })
  o.onProgress?.({ status: job.status, pages: job.pages, jobId: job.id })
  const started = Date.now()
  let delay = cfg.firstDelayMs
  const onAbort = () => { void t.cancel(job.id) }
  o.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      if (o.signal?.aborted) throw new ExtractionError('Cancelled.', 'cancelled')
      if (job.status === 'completed' || job.status === 'partially_completed') {
        if (!job.result) throw new ExtractionError(messageFor('no_output'), 'no_output')
        const r = job.result as ExtractionOutput
        return { provider: 'sarvam', isMock: false, rawText: r.rawText, rawFormat: r.rawFormat, outcome: r.outcome, medicines: r.medicines, otherInstructions: r.otherInstructions ?? [], warnings: r.warnings ?? [], jobId: job.id, language: job.language, document: r.document }
      }
      if (job.status === 'failed' || job.status === 'rejected' || job.status === 'cancelled' || job.status === 'timed_out') {
        const code = job.errorCode ?? (job.status === 'timed_out' ? 'timeout' : job.status)
        const err = new ExtractionError(messageFor(code, job.errorMessage), code as ErrorCode, RETRYABLE.includes(code))
        err.jobId = job.id
        err.rawText = job.result?.rawText // keep the text we did read so the user can compare it
        throw err
      }
      if (Date.now() - started > cfg.maxMs) { void t.cancel(job.id); throw new ExtractionError(messageFor('timeout'), 'timeout', true) }
      await sleep(Math.max(delay, (job.retryAfterSec ?? 0) * 1000), o.signal)
      delay = Math.min(Math.round(delay * 1.5), cfg.maxDelayMs)
      try { job = await t.status(job.id, o.signal) } catch (e) {
        // a rate limit or blip while polling is not fatal: back off and keep going until the deadline
        if (e instanceof ExtractionError && (e.code === 'rate_limit' || e.code === 'network' || e.code === 'unavailable')) { delay = cfg.maxDelayMs; continue }
        throw e
      }
      o.onProgress?.({ status: job.status, pages: job.pages, jobId: job.id })
    }
  } finally { o.signal?.removeEventListener('abort', onAbort) }
}

/**
 * Sample medicines for unit tests and DevPanel fixtures only. Never call this from the live upload screens.
 * It does not read the file.
 */
export const mockExtractor: PrescriptionExtractor = {
  id: 'mock',
  async extract(_f, o) {
    await wait(1400, o.signal)
    const outcome = store.get().demo.extractionOutcome
    if (outcome === 'error') throw new ExtractionError("The image was too blurry or the text couldn't be recognized.", 'unreadable', true)
    const base = { duration: null, notes: '', flags: [] as MedFlagName[], evidence: {} }
    const all: ExtractedMedicine[] = [
      { ...base, name: 'Metformin', strength: '500mg', dose: '1 tablet', frequency: 'twice', times: ['08:00', '20:00'], timeOfDay: [], food: 'after', sourceText: 'Tab Metformin 500mg 1-0-1 after food', lowConfidence: false },
      { ...base, name: 'Amlodipine', strength: '5mg', dose: '1 tablet', frequency: 'once', times: ['08:00'], timeOfDay: [], food: null, sourceText: 'Tab Amlodipine 5mg OD morning', lowConfidence: false },
      { ...base, name: 'Ecosprin', strength: '75mg', dose: '1 tablet', frequency: 'once', times: [], timeOfDay: [], food: null, sourceText: 'Ecosprin 75 OD', lowConfidence: true },
      { ...base, name: 'Atorvastatin', strength: '10mg', dose: '1 tablet', frequency: 'once', times: ['22:00'], timeOfDay: [], food: null, sourceText: 'Tab Atorvastatin 10mg HS', lowConfidence: true },
    ]
    const medicines = outcome === 'partial' ? all.slice(0, 2) : all
    return {
      provider: 'mock', isMock: true, rawText: medicines.map((m) => m.sourceText).join('\n'), outcome: outcome === 'partial' ? 'partial' : 'success', medicines,
      otherInstructions: [], warnings: outcome === 'partial' ? ['Some text was unclear. 1–2 medicines could not be read.'] : [],
    }
  },
}

const transportExtractor = (t: Transport): PrescriptionExtractor => ({ id: 'sarvam', extract: (file, o) => runJob(t, file, o) })

export type ExtractorSource = 'supabase' | 'local' | 'mock' | 'none'

/** Demo sample is opt-in. A real upload never selects the mock extractor, even if demo family is loaded. */
export function chooseExtractorSource(hasBackendSession: boolean, local: 'down' | 'configured' | 'unconfigured', demoSample = false): ExtractorSource {
  if (demoSample) return 'mock'
  if (hasBackendSession) return 'supabase'
  if (local !== 'down') return 'local'
  return 'none'
}

/** 'down' = no dev API (demo mode); otherwise whether it holds a Sarvam key. */
export async function localApiState(): Promise<'down' | 'configured' | 'unconfigured'> {
  if (import.meta.env.VITE_LOCAL_API !== 'true') return 'down'
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return 'down'
    const j = await r.json()
    return j?.mode === 'local-dev' ? (j.configured ? 'configured' : 'unconfigured') : 'down'
  } catch { return 'down' }
}

/** Signed-in Supabase or local Sarvam API for real files. Mock only when the user chose a labelled sample prescription. */
export async function getExtractor(opts?: { demoSample?: boolean }): Promise<PrescriptionExtractor> {
  const { backendConfigured, hasSession } = await import('./backend')
  const source = chooseExtractorSource(backendConfigured() && (await hasSession()), await localApiState(), !!opts?.demoSample)
  if (source === 'mock') return mockExtractor
  if (source === 'supabase') return transportExtractor(supabaseTransport)
  if (source === 'local') return transportExtractor(localTransport)
  const code = backendConfigured() ? 'not_signed_in' : 'unavailable'
  throw new ExtractionError(messageFor(code), code)
}

const TOD: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night']

/** Turn extraction output into DRAFT medicines. Nothing extracted is trusted or activated automatically. */
export function toDraftMedicines(r: ExtractionResult, personId?: string, opts?: { allowDemo?: boolean }): Medicine[] {
  if ((r.isMock || r.provider === 'mock') && !opts?.allowDemo) return []
  const tz = store.get().profile.timeZone
  const who = personId ?? store.get().activePersonId
  const n = now().toISOString()
  return r.medicines.map((e) => {
    const frequency: Frequency = e.frequency ?? 'once'
    const food: Food | null = e.food
    const flags = computeFlags({ strength: e.strength, dose: e.dose, times: e.times, food }, e.lowConfidence)
    for (const f of e.flags) if (!flags.includes(f)) flags.push(f)
    if (e.frequency === null && !flags.includes('frequency_unclear')) flags.push('frequency_unclear')
    return {
      id: newId('med'), name: e.name, strength: e.strength, dose: e.dose, frequency, timeOfDay: e.timeOfDay.filter((t) => TOD.includes(t)), times: e.times,
      food, duration: e.duration === 'course' && e.courseDays ? 'course' as const : 'ongoing' as const, courseDays: e.duration === 'course' ? e.courseDays : undefined,
      notes: e.notes, status: 'draft' as const, source: 'prescription' as const, sourceText: e.sourceText, flags, timeZone: tz, createdAt: n, extractionProvider: r.provider,
      personId: who, prescriber: r.document?.doctorName || undefined,
    }
  })
}
