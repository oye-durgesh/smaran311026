// Local API for the prescription reader, so the full upload → Sarvam → review flow can be tried with just a SARVAM_API_KEY
// (no Supabase needed). It runs the SAME service code as the Edge Functions. The key is read from the server environment only.
//   cp .env.server.example .env.server.local   (set SARVAM_API_KEY)   then   npm run dev:api   and   npm run dev
// Binds to 127.0.0.1; jobs are kept in memory; there is no user auth, so never expose this port.
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { Readable } from 'node:stream'
import { unzipSync } from 'fflate'
import { agentSession, synthesize } from '../../supabase/functions/_shared/elevenlabs.ts'
import { VOICE_ENV, PERSONAS } from '../../supabase/functions/_shared/voices.ts'
import { SarvamDocAi } from '../../supabase/functions/_shared/sarvam.ts'
import { ServiceError, advanceExtraction, cancelExtraction, memoryJobStore, publicJob, submitExtraction } from '../../supabase/functions/_shared/extraction-service.ts'

function loadEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnv(new URL('../.env.server.local', import.meta.url).pathname)

const PORT = Number(process.env.EXTRACTION_API_PORT ?? 8787)
const jobs = memoryJobStore()
const OWNER = 'local-dev'

function sarvam(): SarvamDocAi {
  return new SarvamDocAi({ apiKey: process.env.SARVAM_API_KEY, baseUrl: process.env.SARVAM_BASE_URL, jobPath: process.env.SARVAM_DOC_JOB_PATH })
}
const send = (res: import('node:http').ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}
const readJson = async (req: import('node:http').IncomingMessage) => { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }

createServer(async (req, res) => {
  try {
    const host = (req.headers.host ?? '').split(':')[0]
    if (host !== '127.0.0.1' && host !== 'localhost') return send(res, 403, { error: 'Local access only' })
    if (req.url === '/api/health') return send(res, 200, {
      ok: true, configured: !!process.env.SARVAM_API_KEY, mode: 'local-dev',
      // booleans only: which ElevenLabs settings exist. Never the values.
      elevenlabs: { key: !!process.env.ELEVENLABS_API_KEY, agent: !!process.env.MUMMY_ELEVENLABS_AGENT_ID || !!process.env.PAPA_ELEVENLABS_AGENT_ID, voices: Object.fromEntries(PERSONAS.map((p) => [p, !!(process.env[VOICE_ENV[p]] ?? '').trim()])) },
    })
    if (req.method !== 'POST') return send(res, 404, { error: 'Not found' })

    const env = (k: string) => process.env[k]
    if (req.url === '/api/tts') {
      const b = await readJson(req)
      const text = String(b.text ?? '').trim()
      if (!text || text.length > 600) return send(res, 400, { error: 'Text is missing or too long.', code: 'bad_request' })
      const r = await synthesize(env, { text, persona: b.persona, consent: b.consent === true }) // local: no RLS; deployed tts looks up personId under RLS
      if (!r.ok) return send(res, r.status, r.body)
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'x-voice-persona': r.persona, 'Access-Control-Expose-Headers': 'x-voice-persona', 'Cache-Control': 'no-store' })
      return res.end(Buffer.from(await r.audio.arrayBuffer()))
    }
    if (req.url === '/api/elevenlabs-session') {
      const b = await readJson(req)
      // LOCAL DEV ONLY: there is no database or sign-in here, so the relationship comes from the browser. The deployed Edge Function never does this.
      const r = await agentSession(env, { relationship: b.relationship, consent: b.consent === true })
      return r.ok ? send(res, 200, { signedUrl: r.signedUrl, agent: r.agent, personId: String(b.personId ?? '') }) : send(res, r.status, r.body)
    }

    let deps
    try { deps = { sarvam: sarvam(), jobs, unzip: unzipSync } } catch (e) { return send(res, 503, { error: (e as Error).message, code: 'missing_credentials' }) }

    if (req.url === '/api/extract') {
      const form = await new Request('http://local/', { method: 'POST', headers: req.headers as Record<string, string>, body: Readable.toWeb(req) as unknown as ReadableStream, duplex: 'half' } as RequestInit).formData()
      const file = form.get('file')
      if (!(file instanceof File)) return send(res, 400, { error: 'Missing file', code: 'invalid_file' })
      const job = await submitExtraction(deps, { ownerId: OWNER, file, fileName: file.name, mime: file.type || 'application/octet-stream', size: file.size, language: String(form.get('language') ?? 'en-IN') })
      return send(res, 200, { job: publicJob(job) })
    }
    if (req.url === '/api/extraction-job') {
      const body = await readJson(req)
      const job = body.action === 'cancel' ? await cancelExtraction(deps, body.jobId, OWNER) : await advanceExtraction(deps, body.jobId, OWNER)
      return send(res, 200, { job: publicJob(job) })
    }
    return send(res, 404, { error: 'Not found' })
  } catch (e) {
    if (e instanceof ServiceError) return send(res, e.status || 500, { error: e.message, code: e.code, retryAfterSec: e.retryAfterSec }, e.retryAfterSec ? { 'Retry-After': String(e.retryAfterSec) } : {})
    console.error('dev-server error:', (e as Error).message) // never log document content or the key
    send(res, 500, { error: 'Something went wrong.', code: 'failed' })
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Smaran extraction API (local dev) on http://127.0.0.1:${PORT} — Sarvam key ${process.env.SARVAM_API_KEY ? 'found' : 'NOT set (demo mode only)'}`))
