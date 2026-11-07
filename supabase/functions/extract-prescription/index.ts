// Authenticated prescription extract + confirm. SARVAM_API_KEY never leaves this function.

import { corsHeaders, fail, json, requireUser } from '../_shared/http.ts'
import { logStage } from '../_shared/safe-log.ts'
import { ACCEPTED_MIME, appLangToDoc, isDocLanguage, SMARAN_MAX_BYTES, validateUpload } from '../_shared/extraction-types.ts'
import { advanceExtraction, publicJob, ServiceError, submitExtraction } from '../_shared/extraction-service.ts'
import { SarvamDocAi, SarvamError } from '../_shared/sarvam.ts'
import { supabaseJobStore } from '../_shared/supabase-job-store.ts'
import { confirmPrescription, type ConfirmMedicineInput } from '../_shared/prescription-confirm.ts'
import { supabasePrescriptionStore } from '../_shared/prescription-store.ts'

function makeDeps(jobs: ReturnType<typeof supabaseJobStore>) {
  return {
    sarvam: new SarvamDocAi({
      apiKey: Deno.env.get('SARVAM_API_KEY'),
      baseUrl: Deno.env.get('SARVAM_BASE_URL') || undefined,
      jobPath: Deno.env.get('SARVAM_DOC_JOB_PATH') || 'extract',
    }),
    jobs,
    unzip: () => ({} as Record<string, Uint8Array>),
  }
}

async function memberOk(db: Awaited<ReturnType<typeof requireUser>> extends infer T ? T extends { db: infer D } ? D : never : never, ownerId: string, memberId: string) {
  const { data, error } = await db.from('family_members').select('id, owner_id, active, time_zone, language').eq('owner_id', ownerId).eq('id', memberId).maybeSingle()
  if (error || !data || data.owner_id !== ownerId || !data.active) return null
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail(405, 'Method not allowed')
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const { user, db } = auth
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { body = {} }
  const action = String(body.action || 'start')

  try {
    if (action === 'start') {
      const familyMemberId = String(body.familyMemberId || '')
      const storagePath = String(body.storagePath || '')
      const fileName = String(body.fileName || 'prescription')
      const mime = String(body.mime || '')
      const size = Number(body.size || 0)
      const sha = String(body.contentSha256 || '')
      const language = isDocLanguage(String(body.language || '')) ? String(body.language) : appLangToDoc(String(body.language || 'en'))
      const documentId = String(body.prescriptionId || `rx_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`)
      if (!familyMemberId) return json({ error: 'Choose a family member.', code: 'bad_request' }, 400)
      if (!storagePath.startsWith(`${user.id}/`)) return json({ error: 'Invalid file path.', code: 'permission_denied' }, 403)
      const member = await memberOk(db, user.id, familyMemberId)
      if (!member) return json({ error: 'You cannot manage medicines for that family member.', code: 'permission_denied' }, 403)
      const bad = validateUpload({ name: fileName, type: mime, size })
      if (bad) return json({ error: bad.message, code: bad.code }, bad.code === 'too_large' ? 413 : 415)
      if (size > SMARAN_MAX_BYTES || !ACCEPTED_MIME.includes(mime) && mime !== 'image/jpg') {
        return json({ error: 'Please choose a PDF, PNG or JPG under 10 MB.', code: 'unsupported_type' }, 415)
      }

      if (sha) {
        const { data: dup } = await db.from('prescriptions').select('id, extraction_job_id, status').eq('owner_id', user.id).eq('family_member_id', familyMemberId).eq('content_sha256', sha).maybeSingle()
        if (dup?.extraction_job_id) {
          const jobs = supabaseJobStore(db)
          const existing = await jobs.get(dup.extraction_job_id, user.id)
          if (existing) return json({ duplicate: true, prescriptionId: dup.id, job: publicJob(existing) })
        }
      }

      const { error: upErr } = await db.from('prescriptions').insert({
        id: documentId,
        owner_id: user.id,
        family_member_id: familyMemberId,
        storage_path: storagePath,
        file_name: fileName,
        mime,
        size_bytes: size,
        language,
        content_sha256: sha || documentId,
        status: 'extracting',
      })
      if (upErr) {
        if (/duplicate|unique/i.test(upErr.message)) {
          return json({ duplicate: true, error: 'This prescription was already uploaded for this family member.', code: 'duplicate' }, 409)
        }
        logStage('extract-prescription', 'insert_rx', { status: 500, error: upErr.message })
        return json({ error: 'Could not save the prescription file.', code: 'unavailable' }, 500)
      }

      const { data: file, error: dlErr } = await db.storage.from('prescriptions').download(storagePath)
      if (dlErr || !file) {
        await db.from('prescriptions').update({ status: 'failed' }).eq('id', documentId).eq('owner_id', user.id)
        return json({ error: 'Could not read the uploaded file.', code: 'invalid_file' }, 400)
      }

      const jobs = supabaseJobStore(db)
      const job = await submitExtraction(makeDeps(jobs), {
        ownerId: user.id,
        file,
        fileName,
        mime,
        size,
        language,
        documentId,
        familyMemberId,
        contentSha256: sha,
      })
      await db.from('prescriptions').update({ extraction_job_id: job.id }).eq('id', documentId).eq('owner_id', user.id)
      return json({ duplicate: false, prescriptionId: documentId, job: publicJob(job) })
    }

    if (action === 'poll') {
      const jobId = String(body.jobId || '')
      if (!jobId) return json({ error: 'Missing job.', code: 'bad_request' }, 400)
      const jobs = supabaseJobStore(db)
      const job = await advanceExtraction(makeDeps(jobs), jobId, user.id)
      if (job.documentId && job.result?.document) {
        await db.from('prescriptions').update({
          status: job.status === 'failed' || job.status === 'rejected' || job.status === 'timed_out' ? 'failed' : 'extracted',
          patient_name: job.result.document.patientName || null,
          doctor_name: job.result.document.doctorName || null,
          prescription_date: job.result.document.prescriptionDate || null,
          raw_extract: job.result,
        }).eq('id', job.documentId).eq('owner_id', user.id)
      }
      return json({ job: publicJob(job) })
    }

    if (action === 'confirm') {
      const familyMemberId = String(body.familyMemberId || '')
      const prescriptionId = String(body.prescriptionId || '')
      const medicines = Array.isArray(body.medicines) ? body.medicines as ConfirmMedicineInput[] : []
      const member = await memberOk(db, user.id, familyMemberId)
      if (!member) return json({ error: 'You cannot manage medicines for that family member.', code: 'permission_denied' }, 403)
      const result = await confirmPrescription(supabasePrescriptionStore(db), {
        ownerId: user.id,
        memberId: familyMemberId,
        prescriptionId,
        medicines,
        prescriber: typeof body.prescriber === 'string' ? body.prescriber : null,
      })
      if (!result.ok) {
        const status = result.code === 'permission_denied' ? 403 : result.code === 'not_found' ? 404 : 400
        return json({ error: result.message, code: result.code }, status)
      }
      return json({ ok: true, duplicate: result.duplicate, medicines: result.medicines, schedules: result.schedules })
    }

    return json({ error: 'Unknown action.', code: 'bad_request' }, 400)
  } catch (e) {
    if (e instanceof ServiceError) return json({ error: e.message, code: e.code }, e.status)
    if (e instanceof SarvamError) return json({ error: e.message, code: e.code }, e.status || 502)
    logStage('extract-prescription', action, { status: 500, error: e })
    return json({ error: 'Prescription reading failed. Please try again or add medicines manually.', code: 'unavailable' }, 502)
  }
})
