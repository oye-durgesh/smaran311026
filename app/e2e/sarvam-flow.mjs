// Full upload → Sarvam (FAKE server speaking the documented protocol) → review flow through the real dev API and UI.
// Proves our wiring, not Sarvam's OCR. Run: npm run e2e:sarvam   (needs Playwright: NODE_PATH=$(npm root -g))
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const MD = `| Medicine | Dose | Frequency | Duration |\n|---|---|---|---|\n| Tab Metformin 500mg | 1 tab | BD after food | 30 days |\n| Tab Amlodipine 5mg | 1 tab | OD | |\n\nAdvice: Avoid sugar.`
let mode = 'ok', polls = 0
const fake = createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    const u = req.url
    if (u === '/doc-ai/v1/job/extract') { polls = 0; if (mode === 'ratelimit') { res.writeHead(429, { 'Retry-After': '1' }); return res.end('{}') } res.writeHead(201, { 'content-type': 'application/json' }); return res.end('{"job_id":"j1","status":"pending","run_id":"r1"}') }
    if (u === '/doc-ai/v1/job/j1/status') { polls++; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ status: polls < 2 ? 'running' : mode === 'fail' ? 'failed' : 'completed', usage: { pages_total: 1, pages_processed: 1, pages_succeeded: 1, pages_failed: 0 } })) }
    if ((u ?? '').startsWith('/doc-ai/v1/job/j1/results')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({
        job_id: 'j1', type: 'extract', status: 'completed', version: 1, usage: { pages_total: 1, pages_processed: 1, pages_succeeded: 1, pages_failed: 0 },
        result: {
          patient_name: '', doctor_name: '', prescription_date: '', additional_instructions: 'Avoid sugar.',
          medicines: [
            { name: 'Metformin', strength: '500mg', dosage: '1 tab', frequency: 'BD', intake_timing: '', food_instructions: 'after food', duration: '30 days' },
            { name: 'Amlodipine', strength: '5mg', dosage: '1 tab', frequency: 'OD', intake_timing: '', food_instructions: '', duration: '' },
          ],
        },
        annotations: {},
      }))
    }
    res.writeHead(404); res.end('{}')
  })
}).listen(8791, '127.0.0.1')

const sh = (cmd, args, env = {}) => spawn(cmd, args, { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, ...env }, stdio: 'ignore' })
const api = (key) => sh('node', ['--experimental-strip-types', 'server/dev-server.ts'], { ...(key ? { SARVAM_API_KEY: key } : { SARVAM_API_KEY: '' }), SARVAM_BASE_URL: 'http://127.0.0.1:8791' })
const vite = sh('npx', ['vite', '--port', '5199', '--strictPort'], { VITE_LOCAL_API: 'true' })
let apiProc
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return } catch {} await wait(250) } throw new Error('timeout waiting') }
let failures = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); if (!ok) failures++ }

const dir = mkdtempSync(join(tmpdir(), 'smaran-e2e-'))
const png = join(dir, 'rx.png')
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const gif = join(dir, 'rx.gif'); writeFileSync(gif, 'GIF89a')

async function session(key, body) {
  apiProc = api(key)
  await until(async () => (await fetch('http://127.0.0.1:5199/api/health')).ok)
  const browser = await chromium.launch()
  const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
  const errors = []; p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('http://127.0.0.1:5199/#08'); await p.waitForFunction(() => window.__smaran)
  await p.evaluate(() => { __smaran.store.set((s) => ({ ...s, profile: { ...s.profile, onboarded: true }, medicines: [] })) })
  try { await body(p, errors) } finally { await browser.close(); apiProc.kill(); await wait(500) }
}
const input = 'input[type=file]:not([capture])'
const clickText = (p, t) => p.getByText(t, { exact: true }).first().click()

await until(async () => (await fetch('http://127.0.0.1:5199/')).ok, 40000)

await session('test-key', async (p, errors) => {
  mode = 'ok'
  await p.setInputFiles(input, gif); await p.waitForTimeout(300)
  check('rejects a GIF with a message', await p.getByText(/PDF, PNG or JPG/).count() > 0)
  await p.setInputFiles(input, png); await p.waitForTimeout(300)
  check('shows the filename and a language choice', await p.getByText('rx.png').count() > 0 && await p.getByLabel('Document language').count() === 1)
  await p.getByLabel('Document language').selectOption('hi-IN')
  await clickText(p, 'Read prescription')
  await p.waitForFunction(() => location.hash.startsWith('#10'), null, { timeout: 30000 })
  check('reaches Review Medicines from the REAL (fake-server) reading', true)
  const st = await p.evaluate(() => { const s = __smaran.store.get(); return { ex: s.setup.extraction, meds: s.medicines.map((m) => ({ n: m.name, st: m.status, t: m.times, f: m.flags, food: m.food })) } })
  check('not labelled as demo; keeps job id, language and raw text', st.ex && !st.ex.isMock && st.ex.provider === 'sarvam' && st.ex.jobId && st.ex.language === 'hi-IN' && /Metformin/.test(st.ex.rawText), JSON.stringify(st.ex))
  check('two draft medicines, none active, no invented times', st.meds.length === 2 && st.meds.every((m) => m.st === 'draft' && m.t.length === 0), JSON.stringify(st.meds))
  check('timing flagged for review', st.meds.every((m) => m.f.includes('timing_unclear')))
  check('Amlodipine food left unspecified (not guessed)', st.meds.find((m) => m.n.startsWith('Amlodipine'))?.food === null)
  check('no demo-mode banner', await p.getByText(/Sample data from demo mode/).count() === 0)
  await clickText(p, 'Compare with original text')
  check('compare shows the original text', await p.getByText('Text read from your document').count() === 1)
  await p.getByLabel(/Metformin.*needs review/).first().click()
  await p.waitForFunction(() => location.hash.startsWith('#11'))
  await p.waitForTimeout(500)
  check('medicine opens in the edit screen', await p.locator('input, textarea, select').count() > 0)
  check('no page errors', errors.length === 0, errors.join('|'))
})

await session('test-key', async (p) => {
  mode = 'fail'
  await p.setInputFiles(input, png); await clickText(p, 'Read prescription')
  await p.waitForFunction(() => location.hash.startsWith('#28'), null, { timeout: 30000 })
  await p.waitForTimeout(300)
  check('failed job → error screen with retry', await p.getByRole('button', { name: 'Try again' }).count() === 1, (await p.evaluate(() => JSON.stringify(__smaran.store.get().setup.extraction))))
})

await session('', async (p) => {
  mode = 'ok'
  await p.setInputFiles(input, png); await clickText(p, 'Read prescription')
  await p.waitForFunction(() => location.hash.startsWith('#28'), null, { timeout: 30000 })
  const t3 = await p.locator('.ph').innerText(); const n3 = await p.evaluate(() => __smaran.store.get().medicines.length)
  check('missing key → clear message, no Try again, no fake data', /API key is missing/.test(t3) && !/Try again/.test(t3) && n3 === 0, t3.slice(0, 300) + ' meds=' + n3)
})

vite.kill(); fake.close()
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
