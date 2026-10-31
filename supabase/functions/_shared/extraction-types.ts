// Types shared by the Edge Functions, the local dev server and the app. No runtime imports (Deno + Node + Vite safe).

export type SarvamState = 'pending' | 'running' | 'completed' | 'partially_completed' | 'failed' | 'rejected'
export const TERMINAL_STATES: SarvamState[] = ['completed', 'partially_completed', 'failed', 'rejected']

export type JobStatus =
  | 'submitted' | 'running' | 'completed' | 'partially_completed' | 'failed' | 'rejected' | 'cancelled' | 'timed_out'

export type ErrorCode =
  | 'missing_credentials' | 'invalid_file' | 'too_large' | 'unsupported_type' | 'too_many_pages' | 'rate_limit' | 'billing'
  | 'auth' | 'not_found' | 'timeout' | 'failed' | 'rejected' | 'unavailable' | 'bad_request' | 'no_medicines' | 'no_output' | 'cancelled'

export type MedFlagName =
  | 'timing_unclear' | 'exact_time_needed' | 'food_missing' | 'strength_missing' | 'dose_missing' | 'frequency_unclear'
  | 'duration_unclear' | 'as_needed' | 'low_confidence'

export type FrequencyName = 'once' | 'twice' | 'thrice' | 'custom'
export type TimeOfDayName = 'morning' | 'afternoon' | 'evening' | 'night'

/** One medicine as read from the document. Anything not written in the document is empty/null and flagged. */
export interface ExtractedMedicine {
  name: string
  strength: string
  dose: string
  frequency: FrequencyName | null
  times: string[] // only clock times that are WRITTEN in the document ("at 8 am")
  timeOfDay: TimeOfDayName[] // written periods ("morning", "1-0-1", "HS")
  food: 'before' | 'with' | 'after' | null
  duration: 'ongoing' | 'course' | null
  courseDays?: number
  notes: string
  sourceText: string
  flags: MedFlagName[]
  lowConfidence: boolean
  evidence: Partial<Record<'dose' | 'frequency' | 'timing' | 'food' | 'duration', string>>
}

export interface ExtractionDocument {
  patientName: string
  doctorName: string
  prescriptionDate: string
}

export interface ExtractionOutput {
  provider: 'sarvam'
  isMock: false
  outcome: 'success' | 'partial'
  rawText: string
  rawFormat: 'md' | 'html' | 'json'
  medicines: ExtractedMedicine[]
  otherInstructions: string[]
  warnings: string[]
  pages?: { total: number; succeeded: number; failed: number }
  document?: ExtractionDocument
}

export interface ExtractionJob {
  id: string
  ownerId: string
  provider: 'sarvam'
  sarvamJobId: string | null
  fileName: string
  mime: string
  size: number
  language: string
  outputFormat: 'md' | 'html' | 'json'
  status: JobStatus
  pages?: { total: number; processed: number; succeeded: number; failed: number }
  errorCode?: ErrorCode
  errorMessage?: string
  retryAfterSec?: number
  result?: ExtractionOutput
  createdAt: string
  updatedAt: string
}

export interface JobStore {
  create(job: ExtractionJob): Promise<void>
  get(id: string, ownerId: string): Promise<ExtractionJob | null>
  update(id: string, patch: Partial<ExtractionJob>): Promise<ExtractionJob>
}

/** Languages documented for Sarvam Document AI (BCP-47). */
export const DOC_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'hi-IN', name: 'Hindi' }, { code: 'en-IN', name: 'English' }, { code: 'bn-IN', name: 'Bengali' }, { code: 'ta-IN', name: 'Tamil' },
  { code: 'te-IN', name: 'Telugu' }, { code: 'mr-IN', name: 'Marathi' }, { code: 'gu-IN', name: 'Gujarati' }, { code: 'kn-IN', name: 'Kannada' },
  { code: 'ml-IN', name: 'Malayalam' }, { code: 'od-IN', name: 'Odia' }, { code: 'pa-IN', name: 'Punjabi' }, { code: 'as-IN', name: 'Assamese' },
  { code: 'brx-IN', name: 'Bodo' }, { code: 'doi-IN', name: 'Dogri' }, { code: 'ks-IN', name: 'Kashmiri' }, { code: 'kok-IN', name: 'Konkani' },
  { code: 'mai-IN', name: 'Maithili' }, { code: 'mni-IN', name: 'Manipuri' }, { code: 'ne-IN', name: 'Nepali' }, { code: 'sa-IN', name: 'Sanskrit' },
  { code: 'sat-IN', name: 'Santali' }, { code: 'sd-IN', name: 'Sindhi' }, { code: 'ur-IN', name: 'Urdu' },
]
export const isDocLanguage = (c: string) => DOC_LANGUAGES.some((l) => l.code === c)
export const appLangToDoc = (l: string): string => ({ hi: 'hi-IN', en: 'en-IN', mr: 'mr-IN', kn: 'kn-IN' } as Record<string, string>)[l] ?? 'en-IN'

// Limits from the Sarvam docs (Extract): PDF, PNG, JPG/JPEG; 20 pages; 200 MB. Smaran caps uploads lower (10 MB) for phones.
export const ACCEPTED_EXT = ['pdf', 'png', 'jpg', 'jpeg']
export const ACCEPTED_MIME = ['application/pdf', 'image/png', 'image/jpeg']
export const SMARAN_MAX_BYTES = 10 * 1024 * 1024
export const SARVAM_MAX_PAGES = 20

export function validateUpload(f: { name: string; type: string; size: number }): { code: ErrorCode; message: string } | null {
  const ext = f.name.toLowerCase().split('.').pop() ?? ''
  const typeOk = ACCEPTED_MIME.includes(f.type) || (f.type === '' || f.type === 'application/octet-stream') && ACCEPTED_EXT.includes(ext)
  if (!typeOk || !ACCEPTED_EXT.includes(ext)) return { code: 'unsupported_type', message: 'Please choose a PDF, PNG or JPG file.' }
  if (f.size <= 0) return { code: 'invalid_file', message: 'This file is empty. Please choose another file.' }
  if (f.size > SMARAN_MAX_BYTES) return { code: 'too_large', message: `This file is too large (${(f.size / 1048576).toFixed(1)} MB). The limit is 10 MB.` }
  return null
}
