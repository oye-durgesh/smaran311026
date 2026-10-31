// JobStore backed by the extraction_jobs table (RLS: owner only). Pass a client that acts AS the signed-in user.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { ExtractionJob, JobStore } from './extraction-types.ts'

const toRow = (j: ExtractionJob) => ({
  id: j.id, owner_id: j.ownerId, provider: j.provider, sarvam_job_id: j.sarvamJobId, file_name: j.fileName, mime: j.mime, size_bytes: j.size,
  language: j.language, output_format: j.outputFormat, status: j.status, pages: j.pages ?? null, error_code: j.errorCode ?? null,
  error_message: j.errorMessage ?? null, retry_after_sec: j.retryAfterSec ?? null, result: j.result ?? null, document_id: (j as ExtractionJob & { documentId?: string }).documentId ?? null,
})
// deno-lint-ignore no-explicit-any
const fromRow = (r: any): ExtractionJob => ({
  id: r.id, ownerId: r.owner_id, provider: 'sarvam', sarvamJobId: r.sarvam_job_id, fileName: r.file_name, mime: r.mime, size: Number(r.size_bytes),
  language: r.language, outputFormat: r.output_format, status: r.status, pages: r.pages ?? undefined, errorCode: r.error_code ?? undefined,
  errorMessage: r.error_message ?? undefined, retryAfterSec: r.retry_after_sec ?? undefined, result: r.result ?? undefined,
  createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
})

export function supabaseJobStore(db: SupabaseClient): JobStore {
  return {
    async create(j) { const { error } = await db.from('extraction_jobs').insert(toRow(j)); if (error) throw new Error(error.message) },
    async get(id, ownerId) {
      const { data, error } = await db.from('extraction_jobs').select('*').eq('id', id).eq('owner_id', ownerId).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? fromRow(data) : null
    },
    async update(id, patch) {
      const COL: Record<string, string> = {
        sarvamJobId: 'sarvam_job_id', status: 'status', pages: 'pages', errorCode: 'error_code', errorMessage: 'error_message',
        retryAfterSec: 'retry_after_sec', result: 'result',
      }
      const row: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) if (COL[k]) row[COL[k]] = v === undefined ? null : v // undefined clears the column
      const { data, error } = await db.from('extraction_jobs').update(row).eq('id', id).select('*').single()
      if (error) throw new Error(error.message)
      return fromRow(data)
    },
  }
}
