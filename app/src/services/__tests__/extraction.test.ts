import { describe, expect, it, vi } from 'vitest'
import { ExtractionError, chooseExtractorSource, messageFor, runJob, toDraftMedicines, validatePrescriptionFile } from '../extraction'
import type { Transport } from '../extraction'

const base = { id: 'job1', ownerId: 'x', provider: 'sarvam', sarvamJobId: null, fileName: 'rx.pdf', mime: 'application/pdf', size: 5, language: 'hi-IN', outputFormat: 'md', createdAt: '', updatedAt: '' }
const med = (o: object = {}) => ({ name: 'Metformin', strength: '500mg', dose: '1 tablet', frequency: 'twice', times: [], timeOfDay: ['morning', 'night'], food: 'after', duration: 'course', courseDays: 5, notes: '', sourceText: 'Tab Metformin 500 mg 1-0-1 pc x 5 days', flags: ['exact_time_needed'], lowConfidence: false, evidence: {}, ...o })
const done = (extra: object = {}) => ({ ...base, status: 'completed', result: { provider: 'sarvam', isMock: false, outcome: 'success', rawText: 'RAW', rawFormat: 'md', medicines: [med()], otherInstructions: ['Drink water'], warnings: [], ...extra } })
const noSleep = () => Promise.resolve()
const opts = { name: 'rx.pdf', mime: 'application/pdf', language: 'hi-IN' }
const cfg = { maxMs: 60_000, firstDelayMs: 10, maxDelayMs: 100 }
const transport = (jobs: any[], extra: Partial<Transport> = {}): Transport & { calls: string[] } => {
  const calls: string[] = []
  let i = 0
  return {
    calls,
    submit: async (_f, _n, lang) => { calls.push('submit:' + lang); return jobs[i++] },
    status: async () => { calls.push('status'); const j = jobs[Math.min(i++, jobs.length - 1)]; if (j instanceof Error) throw j; return j },
    cancel: async () => { calls.push('cancel') },
    ...extra,
  }
}

describe('file validation (client)', () => {
  const ok = { name: 'a.pdf', type: 'application/pdf', size: 1000 }
  it('accepts PDF, PNG, JPG', () => {
    expect(validatePrescriptionFile(ok)).toBeNull()
    expect(validatePrescriptionFile({ name: 'a.png', type: 'image/png', size: 5 })).toBeNull()
    expect(validatePrescriptionFile({ name: 'a.jpg', type: 'image/jpeg', size: 5 })).toBeNull()
  })
  it('rejects other types, empty and oversize files', () => {
    expect(validatePrescriptionFile({ name: 'a.gif', type: 'image/gif', size: 5 })).toMatch(/PDF, PNG or JPG/)
    expect(validatePrescriptionFile({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/)
    expect(validatePrescriptionFile({ ...ok, size: 11 * 1048576 })).toMatch(/too large/)
  })
})

describe('job polling', () => {
  it('sends the chosen language, polls until completed and returns the real output', async () => {
    const t = transport([{ ...base, status: 'submitted' }, { ...base, status: 'running' }, done()])
    const r = await runJob(t, new Blob(['x']), opts, cfg, noSleep)
    expect(t.calls).toEqual(['submit:hi-IN', 'status', 'status'])
    expect(r).toMatchObject({ provider: 'sarvam', isMock: false, rawText: 'RAW', jobId: 'job1', language: 'hi-IN', outcome: 'success' })
  })
  it('partially completed keeps the partial outcome and warnings', async () => {
    const t = transport([{ ...done({ outcome: 'partial', warnings: ['1 of 3 pages failed'] }), status: 'partially_completed' }])
    const r = await runJob(t, new Blob(['x']), opts, cfg, noSleep)
    expect(r.outcome).toBe('partial'); expect(r.warnings).toEqual(['1 of 3 pages failed'])
  })
  it.each([['failed', 'failed'], ['rejected', 'rejected']])('%s job becomes a retryable ExtractionError', async (status, code) => {
    const t = transport([{ ...base, status, errorCode: code, errorMessage: 'x' }])
    await expect(runJob(t, new Blob(['x']), opts, cfg, noSleep)).rejects.toMatchObject({ code, retryable: true })
  })
  it('a failed job keeps the text that was read', async () => {
    const t = transport([{ ...base, status: 'failed', errorCode: 'no_medicines', result: { rawText: 'SOME TEXT' } }])
    await expect(runJob(t, new Blob(['x']), opts, cfg, noSleep)).rejects.toMatchObject({ code: 'no_medicines', rawText: 'SOME TEXT' })
  })
  it('gives up at the deadline with a timeout and asks the server to stop tracking', async () => {
    const running = { ...base, status: 'running' }
    const t = transport([running, running, running])
    await expect(runJob(t, new Blob(['x']), opts, { ...cfg, maxMs: -1 }, noSleep)).rejects.toMatchObject({ code: 'timeout', retryable: true })
    expect(t.calls).toContain('cancel')
  })
  it('backs off exponentially, honours retryAfterSec and survives a rate-limited poll', async () => {
    const sleeps: number[] = []
    const t = transport([{ ...base, status: 'submitted' }, new ExtractionError('busy', 'rate_limit', true), { ...base, status: 'running', retryAfterSec: 3 }, done()])
    await runJob(t, new Blob(['x']), opts, cfg, async (ms) => { sleeps.push(ms) })
    expect(sleeps[0]).toBe(10)
    expect(sleeps[1]).toBe(100)           // after a rate limit, back off to the maximum
    expect(sleeps[2]).toBeGreaterThanOrEqual(3000)
  })
  it('stops polling and cancels the job when the user cancels', async () => {
    const ac = new AbortController()
    const t = transport([{ ...base, status: 'running' }])
    const p = runJob(t, new Blob(['x']), { ...opts, signal: ac.signal }, cfg, async (_ms, s) => { ac.abort(); if (s?.aborted) throw new ExtractionError('Cancelled.', 'cancelled') })
    await expect(p).rejects.toMatchObject({ code: 'cancelled' })
    expect(t.calls).toContain('cancel')
  })
  it('a non-retryable server error (missing key) is surfaced as is', async () => {
    const t = transport([], { submit: async () => { throw new ExtractionError(messageFor('missing_credentials'), 'missing_credentials') } })
    await expect(runJob(t, new Blob(['x']), opts, cfg, noSleep)).rejects.toMatchObject({ code: 'missing_credentials', retryable: false })
  })
})

describe('extractor choice (live flow)', () => {
  it('uses mock only for an explicit demo sample, never as a silent fallback', () => {
    expect(chooseExtractorSource(true, 'down', true)).toBe('mock')
    expect(chooseExtractorSource(true, 'down', false)).toBe('supabase')
    expect(chooseExtractorSource(false, 'configured', false)).toBe('local')
    expect(chooseExtractorSource(false, 'unconfigured', false)).toBe('local')
    expect(chooseExtractorSource(false, 'down', false)).toBe('none')
    expect(chooseExtractorSource(true, 'configured', false)).toBe('supabase')
  })
})

describe('draft medicines from real output', () => {
  const result = (m: object) => ({ provider: 'sarvam' as const, isMock: false, rawText: 'RAW', outcome: 'success' as const, medicines: [med(m)] as any, otherInstructions: [], warnings: [] })
  it('keeps only what is written, as unconfirmed drafts, and flags the rest', () => {
    const [d] = toDraftMedicines(result({}), 'per_mum')
    expect(d).toMatchObject({ status: 'draft', source: 'prescription', personId: 'per_mum', times: [], food: 'after', duration: 'course', courseDays: 5, sourceText: expect.stringContaining('Metformin') })
    expect(d.flags).toEqual(expect.arrayContaining(['timing_unclear', 'exact_time_needed']))
  })
  it('discards mock extraction on a real upload, and keeps labelled drafts when demo is opted in', () => {
    const mock = { provider: 'mock' as const, isMock: true, rawText: '', outcome: 'success' as const, medicines: [med()] as any, otherInstructions: [], warnings: [] }
    expect(toDraftMedicines(mock)).toEqual([])
    const [d] = toDraftMedicines(mock, 'per_mum', { allowDemo: true })
    expect(d).toMatchObject({ status: 'draft', personId: 'per_mum', extractionProvider: 'mock' })
  })
  it('missing dose, strength, food and frequency are flagged, never filled in', () => {
    const [d] = toDraftMedicines(result({ strength: '', dose: '', food: null, frequency: null, duration: null, courseDays: undefined, times: [] }), 'per_mum')
    expect(d.strength).toBe(''); expect(d.dose).toBe(''); expect(d.food).toBeNull(); expect(d.times).toEqual([])
    expect(d.flags).toEqual(expect.arrayContaining(['strength_missing', 'dose_missing', 'food_missing', 'frequency_unclear', 'timing_unclear']))
    expect(d.duration).toBe('ongoing')
  })
})
