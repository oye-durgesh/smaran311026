// Verifies the REAL Sarvam integration with your key and a real document, without the app:
//   SARVAM_API_KEY=... npm run sarvam:smoke -- ./prescription.jpg [hi-IN|en-IN|...]
// Prints the job lifecycle, the extracted text and the medicine draft. Needs network access to api.sarvam.ai.
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

function loadEnvFile(p: string) {
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnvFile(fileURLToPath(new URL('../../supabase/.env.local', import.meta.url)))
loadEnvFile(fileURLToPath(new URL('../.env.server.local', import.meta.url)))
import { unzipSync } from 'fflate'
import { SarvamDocAi } from '../../supabase/functions/_shared/sarvam.ts'
import { advanceExtraction, memoryJobStore, submitExtraction } from '../../supabase/functions/_shared/extraction-service.ts'

const [, , path, lang = 'en-IN'] = process.argv
if (!path) { console.error('usage: npm run sarvam:smoke -- <file.(pdf|png|jpg)> [language]'); process.exit(2) }
const bytes = readFileSync(path)
const ext = path.toLowerCase().split('.').pop()
const mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg'
if (!process.env.SARVAM_API_KEY) { console.error('SARVAM_API_KEY is not set (server env only; not printed).'); process.exit(2) }
const deps = { sarvam: new SarvamDocAi({ apiKey: process.env.SARVAM_API_KEY, baseUrl: process.env.SARVAM_BASE_URL, jobPath: process.env.SARVAM_DOC_JOB_PATH ?? 'extract' }), jobs: memoryJobStore(), unzip: unzipSync }
let job = await submitExtraction(deps, { ownerId: 'smoke', file: new Blob([bytes]), fileName: basename(path), mime, size: bytes.length, language: lang })
console.log('submitted local job', job.id, 'sarvam_job_present', !!job.sarvamJobId)
const started = Date.now()
while (!['completed', 'partially_completed', 'failed', 'rejected', 'timed_out'].includes(job.status) && Date.now() - started < 180_000) {
  await new Promise((r) => setTimeout(r, 4000))
  job = await advanceExtraction(deps, job.id, 'smoke')
  console.log('status', job.status, job.pages ? `${job.pages.processed}/${job.pages.total} pages` : '')
}
console.log('\nFINAL STATUS:', job.status, job.errorCode ?? '', job.errorMessage ?? '')
if (job.result) {
  console.log('\n--- extracted text ---\n' + job.result.rawText.slice(0, 2000))
  console.log('\n--- medicine draft (needs review) ---')
  for (const m of job.result.medicines) console.log(JSON.stringify({ name: m.name, strength: m.strength, dose: m.dose, frequency: m.frequency, timeOfDay: m.timeOfDay, food: m.food, duration: m.duration, courseDays: m.courseDays, flags: m.flags, source: m.sourceText }))
  console.log('other instructions:', job.result.otherInstructions)
}
