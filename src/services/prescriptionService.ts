import type { AppState, Frequency, Medicine, ProfileId, TimeOfDay } from '../types'
import { isoDate } from '../data/demoData'
import { BackendError, callFunction, getClient } from './backend'
import { liveFlag, liveUserId } from './dataService'
import { memberId } from './mapping'
import { ensureFamilyMemberRows } from './identity'
import { normalizeFrequency, suggestedTimes } from './scheduleUtils'

const appLangToDoc = (l: string) => ({ hi: 'hi-IN', en: 'en-IN', mr: 'mr-IN', kn: 'kn-IN' } as Record<string, string>)[l] ?? 'en-IN'

const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg']
const MAX = 10 * 1024 * 1024
const TOD: Record<string, TimeOfDay> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' }
const FREQ: Record<string, Frequency> = { once: 'Once daily', twice: 'Twice daily', thrice: 'Three times daily', custom: 'Custom' }
const FOOD: Record<string, Medicine['food']> = { before: 'Before food', with: 'With food', after: 'After food', none: 'No instruction' }
const FLAG_LABEL: Record<string, string> = {
  timing_unclear: 'Timing is not written — enter the time from the prescription or doctor.',
  exact_time_needed: 'A period is written (for example morning) but not an exact clock time.',
  food_missing: 'Food instruction is not written.',
  strength_missing: 'Strength is not written.',
  dose_missing: 'Dosage is not written — enter it from the prescription or doctor.',
  frequency_unclear: 'Frequency is not written — enter it from the prescription or doctor.',
  duration_unclear: 'Duration is not written.',
  as_needed: 'Written as needed — no fixed reminder until you set times.',
  low_confidence: 'This line looks uncertain. Check it against the prescription.',
}

export function validatePrescriptionFile(file: File): string | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  const typeOk = ACCEPT.includes(file.type) || (!file.type && ['pdf', 'png', 'jpg', 'jpeg'].includes(ext))
  if (!typeOk || !['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) return 'Please choose a PDF, PNG or JPG file.'
  if (file.size <= 0) return 'This file is empty. Please choose another file.'
  if (file.size > MAX) return `This file is too large (${(file.size / 1048576).toFixed(1)} MB). The limit is 10 MB.`
  return null
}

export async function fileSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const d = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function flagLabels(flags: string[] | undefined): string[] {
  return (flags ?? []).map((f) => FLAG_LABEL[f] ?? f)
}

export function speakExtraction(state: AppState): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const ex = state.extraction
  if (!ex) return
  const lang = appLangToDoc((() => {
    const l = state.settings.language
    return l === 'English' ? 'en' : l === 'मराठी' ? 'mr' : l === 'ಕನ್ನಡ' ? 'kn' : 'hi'
  })())
  const bits: string[] = []
  if (ex.document?.patientName) bits.push(`Patient ${ex.document.patientName}`)
  if (ex.document?.doctorName) bits.push(`Doctor ${ex.document.doctorName}`)
  if (ex.document?.prescriptionDate) bits.push(`Date ${ex.document.prescriptionDate}`)
  for (const m of ex.items) {
    bits.push([m.name, m.strength, m.dose, m.frequency, m.times.join(' and '), m.food !== 'No instruction' ? m.food : '', m.originalRx].filter(Boolean).join(', '))
    const issues = flagLabels(m.reviewFlags)
    if (issues.length) bits.push(issues.join('. '))
  }
  if (ex.warnings?.length) bits.push(ex.warnings.join('. '))
  const text = bits.join('. ')
  if (!text.trim()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  u.rate = state.settings.speakingSpeed === 'Slower' ? 0.85 : 1
  window.speechSynthesis.speak(u)
}

type ExtractedWire = {
  name?: string
  brandName?: string
  genericName?: string
  strength?: string
  dose?: string
  frequency?: string | null
  times?: string[]
  timeOfDay?: string[]
  food?: string | null
  duration?: string | null
  courseDays?: number
  startDate?: string
  endDate?: string
  notes?: string
  specialInstructions?: string
  sourceText?: string
  flags?: string[]
  lowConfidence?: boolean
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function extractedToMedicine(raw: ExtractedWire, profileId: ProfileId, prescriptionId?: string): Medicine {
  const flags = [...(raw.flags ?? []), ...(raw.lowConfidence ? ['low_confidence'] : [])]
  const frequency = raw.frequency ? normalizeFrequency(FREQ[raw.frequency] ?? raw.frequency) : 'Once daily'
  const tod = TOD[raw.timeOfDay?.[0] ?? ''] ?? 'Morning'
  const times = (raw.times ?? []).filter((t) => /^\d{2}:\d{2}$/.test(t))
  return {
    id: uid('x'),
    profileId,
    name: (raw.name || raw.brandName || raw.genericName || '').trim(),
    brandName: raw.brandName || undefined,
    genericName: raw.genericName || undefined,
    strength: (raw.strength || '').trim(),
    dose: (raw.dose || '').trim(),
    frequency,
    timeOfDay: tod,
    times,
    food: FOOD[raw.food ?? ''] ?? 'No instruction',
    duration: raw.duration === 'course' ? 'Fixed course' : 'Ongoing',
    courseDays: raw.courseDays,
    startedOn: raw.startDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate) ? raw.startDate : isoDate(new Date()),
    endedOn: raw.endDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.endDate) ? raw.endDate : undefined,
    status: 'needs_review',
    originalRx: raw.sourceText || undefined,
    forCondition: raw.notes || raw.specialInstructions || undefined,
    reviewFlags: flags,
    prescriptionId,
    gradient: ['#E7EDE2', '#B5C4A0'],
    demo: liveFlag(),
  }
}

export function confirmPayload(items: Medicine[]) {
  const F: Record<Frequency, string> = { 'Once daily': 'once', 'Twice daily': 'twice', 'Three times daily': 'thrice', Custom: 'custom' }
  const Fd: Record<Medicine['food'], string> = { 'Before food': 'before', 'With food': 'with', 'After food': 'after', 'No instruction': 'none' }
  return items.map((m) => ({
    name: m.name,
    brandName: m.brandName,
    genericName: m.genericName,
    strength: m.strength,
    dose: m.dose,
    frequency: F[m.frequency],
    times: m.times,
    food: Fd[m.food],
    duration: m.duration === 'Fixed course' ? 'course' : 'ongoing',
    courseDays: m.courseDays,
    startDate: m.startedOn,
    endDate: m.endedOn,
    notes: m.forCondition,
    sourceText: m.originalRx,
  }))
}

export function medicinesFromConfirmRows(rows: Array<Record<string, unknown>>, profileId: ProfileId): Medicine[] {
  return rows.map((r) => ({
    id: String(r.id),
    profileId,
    name: String(r.name ?? ''),
    strength: String(r.strength ?? ''),
    dose: String(r.dose ?? ''),
    frequency: normalizeFrequency(FREQ[String(r.frequency)] ?? String(r.frequency)),
    timeOfDay: 'Morning' as TimeOfDay,
    times: (r.times as string[]) ?? [],
    food: FOOD[String(r.food)] ?? 'No instruction',
    duration: r.duration === 'course' ? 'Fixed course' as const : 'Ongoing' as const,
    courseDays: r.course_days == null ? undefined : Number(r.course_days),
    startedOn: r.start_date ? String(r.start_date).slice(0, 10) : isoDate(new Date()),
    endedOn: r.end_date ? String(r.end_date).slice(0, 10) : undefined,
    status: 'ready' as const,
    originalRx: (r.source_text as string) || undefined,
    prescriptionId: (r.prescription_ref as string) || undefined,
    gradient: ['#E7EDE2', '#B5C4A0'] as [string, string],
    demo: false,
  }))
}

type JobPublic = {
  id: string
  status: string
  errorMessage?: string
  errorCode?: string
  retryAfterSec?: number
  result?: {
    medicines?: ExtractedWire[]
    warnings?: string[]
    document?: { patientName: string; doctorName: string; prescriptionDate: string }
    outcome?: string
  }
}

export async function startLivePrescription(file: File, state: AppState): Promise<{ jobId: string; prescriptionId: string; previewUrl: string; duplicate?: boolean; job?: JobPublic }> {
  const uid = liveUserId()
  if (!uid) throw new BackendError('Sign in to scan a prescription into your family account.', 401, 'not_signed_in')
  await ensureFamilyMemberRows()
  const member = memberId(uid, state.activeProfileId)
  const sha = await fileSha256(file)
  const prescriptionId = `rx_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'prescription'
  const path = `${uid}/${member}/${prescriptionId}/${safe}`
  const db = await getClient()
  const { error: up } = await db.storage.from('prescriptions').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (up) throw new BackendError(up.message.includes('Bucket') ? 'Prescription storage is not set up yet.' : 'Could not upload the prescription.', 0, 'upload')
  const language = appLangToDoc((() => {
    const l = state.settings.language
    return l === 'English' ? 'en' : l === 'मराठी' ? 'mr' : l === 'ಕನ್ನಡ' ? 'kn' : 'hi'
  })())
  const res = await callFunction<{ job?: JobPublic; prescriptionId?: string; duplicate?: boolean }>('extract-prescription', {
    action: 'start',
    familyMemberId: member,
    storagePath: path,
    fileName: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    contentSha256: sha,
    language,
    prescriptionId,
  })
  return {
    jobId: res.job?.id || '',
    prescriptionId: res.prescriptionId || prescriptionId,
    previewUrl: URL.createObjectURL(file),
    duplicate: res.duplicate,
    job: res.job,
  }
}

export async function pollPrescriptionJob(jobId: string): Promise<JobPublic> {
  const res = await callFunction<{ job: JobPublic }>('extract-prescription', { action: 'poll', jobId })
  return res.job
}

export async function confirmLivePrescription(state: AppState): Promise<Medicine[]> {
  const uid = liveUserId()
  const ex = state.extraction
  if (!uid || !ex?.prescriptionId) throw new BackendError('Sign in to save these medicines.', 401)
  const res = await callFunction<{ medicines?: Array<Record<string, unknown>>; duplicate?: boolean; error?: string }>('extract-prescription', {
    action: 'confirm',
    familyMemberId: memberId(uid, state.activeProfileId),
    prescriptionId: ex.prescriptionId,
    medicines: confirmPayload(ex.items),
    prescriber: ex.document?.doctorName,
  })
  if (res.duplicate && (!res.medicines || !res.medicines.length)) {
    throw new BackendError('This prescription was already added for this family member. Existing reminders were kept.', 409, 'duplicate')
  }
  return medicinesFromConfirmRows(res.medicines ?? [], state.activeProfileId)
}

export function applyJobToExtraction(s: AppState, job: JobPublic, extra: { previewUrl?: string; prescriptionId?: string }): AppState {
  const meds = (job.result?.medicines ?? []).map((m) => extractedToMedicine(m, s.activeProfileId, extra.prescriptionId))
  return {
    ...s,
    extraction: {
      items: meds,
      reviewed: [],
      live: true,
      jobId: job.id,
      prescriptionId: extra.prescriptionId ?? s.extraction?.prescriptionId,
      previewUrl: extra.previewUrl ?? s.extraction?.previewUrl,
      warnings: job.result?.warnings,
      document: job.result?.document,
      error: job.errorMessage,
    },
  }
}

export { suggestedTimes }
