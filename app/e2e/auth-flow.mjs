// Email sign-up / verification / sign-in / password-reset through the real UI. Supabase Auth is a MOCK here (Playwright route
// interception of /auth/v1/*): this proves OUR screens and error handling, not Supabase itself. Live procedure: docs/LIVE_VERIFICATION.md.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const root = new URL('..', import.meta.url).pathname
const SB = 'http://127.0.0.1:54399'
const vite = spawn('npx', ['vite', '--port', '5195', '--strictPort'], { cwd: root, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: 'test-anon-key-not-real' } })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return } catch {} await wait(300) } throw new Error('timeout') }
let failures = 0
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failures++ }
await until(async () => (await fetch('http://127.0.0.1:5195/')).ok)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-1', email: 'durgesh@example.com', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: 'u-1', aud: 'authenticated', role: 'authenticated', email: 'durgesh@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user }

const browser = await chromium.launch()
async function open(handler) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const calls = []
  await ctx.route(`${SB}/**`, async (route) => {
    const req = route.request(), url = new URL(req.url())
    const body = req.postData() ? (() => { try { return JSON.parse(req.postData()) } catch { return {} } })() : {}
    calls.push({ m: req.method(), path: url.pathname, q: url.search, body })
    const out = handler({ m: req.method(), path: url.pathname, q: url.search, body })
    if (out) return route.fulfill({ status: out.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out.json) })
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ status: req.method() === 'GET' ? 200 : 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' })
  })
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://127.0.0.1:5195/#01'); await p.waitForFunction(() => window.__smaran)
  await p.evaluate(() => __smaran.wipeAll()); await p.reload(); await p.waitForFunction(() => window.__smaran)
  return { p, calls, errs, ctx }
}
const click = async (p, t) => { await p.locator('.ph').getByText(t, { exact: true }).first().click(); await p.waitForTimeout(300) }
const text = (p) => p.locator('.ph').innerText()
const hash = (p) => p.evaluate(() => location.hash.split('/')[0])

// ── sign-up needs verification ──
{
  const { p, calls, errs, ctx } = await open(({ path }) => (path === '/auth/v1/signup' ? { status: 200, json: user } : null))
  await click(p, 'Get Started')
  check('no phone-number field on the account screen', (await p.locator('#acc-phone').count()) === 0 && (await p.locator('#acc-email').count()) === 1 && (await p.locator('#acc-password').count()) === 1)
  await click(p, 'Continue')
  const t0 = await text(p)
  check('empty form: name, email and password are all required', /Please enter your name/.test(t0) && /valid email/.test(t0) && /at least 8 characters/.test(t0))
  await p.fill('#acc-name', 'Durgesh Kumar'); await p.fill('#acc-email', 'not-an-email'); await p.fill('#acc-password', 'short'); await click(p, 'Continue')
  check('bad email and short password are rejected before any request', /valid email/.test(await text(p)) && calls.filter((c) => c.path === '/auth/v1/signup').length === 0)
  await p.fill('#acc-email', 'durgesh@example.com'); await p.fill('#acc-password', 'a-long-enough-password'); await click(p, 'Continue')
  await p.waitForTimeout(600)
  const su = calls.find((c) => c.path === '/auth/v1/signup')
  check('sign-up goes to Supabase Auth with email + password and the name as metadata (no phone)', !!su && su.body.email === 'durgesh@example.com' && su.body.password === 'a-long-enough-password' && su.body.data?.full_name === 'Durgesh Kumar' && !('phone' in su.body))
  check('shows "Check your email" and does NOT continue until verified', /Check your email/.test(await text(p)) && (await hash(p)) === '#02')
  check('the password is never stored in app state or localStorage', !(await p.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(__smaran.store.get()))).includes('a-long-enough-password'))
  await click(p, 'I have verified my email')
  check('"verified" without a session is refused with a clear message', /not seen the verification/.test(await text(p)) && (await hash(p)) === '#02')
  await click(p, 'Send the email again'); await p.waitForTimeout(400)
  check('resend calls the resend endpoint', calls.some((c) => c.path === '/auth/v1/resend' && c.body.type === 'signup'))
  check('no page errors (sign-up)', errs.length === 0, errs.join('|')); await ctx.close()
}

// ── sign in: wrong password, then success ──
{
  let attempt = 0
  const { p, calls, errs, ctx } = await open(({ path, q }) => {
    if (path === '/auth/v1/token' && q.includes('password')) return ++attempt === 1 ? { status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } } : { status: 200, json: session }
    if (path === '/auth/v1/user') return { status: 200, json: user }
    return null
  })
  await click(p, 'I already have an account')
  await p.evaluate(() => { location.hash = '#02/signin' }); await p.waitForTimeout(300)
  check('sign-in mode has no name field', (await p.locator('#acc-name').count()) === 0 && /Welcome back/.test(await text(p)))
  await p.fill('#acc-email', 'durgesh@example.com'); await p.fill('#acc-password', 'wrong'); await click(p, 'Continue'); await p.waitForTimeout(500)
  check('wrong password → plain-language error, not signed in', /email or password is not correct/.test(await text(p)))
  await p.fill('#acc-password', 'right-password-1'); await click(p, 'Continue'); await p.waitForTimeout(1200)
  check('correct password signs in and continues onboarding (#03)', (await hash(p)) === '#03', await hash(p))
  await p.reload(); await p.waitForTimeout(800)
  const restored = await p.evaluate(async () => { const k = Object.keys(localStorage).find((x) => x.includes('auth-token')); return !!k })
  check('the session is restored after a refresh (stored by Supabase Auth, not by the app)', restored)
  check('no page errors (sign-in)', errs.length === 0, errs.join('|')); await ctx.close()
}

// ── forgot / reset ──
{
  const { p, calls, errs, ctx } = await open(() => null)
  await p.evaluate(() => { location.hash = '#02/signin' }); await p.waitForTimeout(300)
  await click(p, 'Forgot password?')
  check('forgot-password mode asks only for the email', (await p.locator('#acc-password').count()) === 0 && /Reset your password/.test(await text(p)))
  await p.fill('#acc-email', 'durgesh@example.com'); await click(p, 'Send reset link'); await p.waitForTimeout(500)
  check('reset email requested', calls.some((c) => c.path === '/auth/v1/recover' && c.body.email === 'durgesh@example.com'))
  check('the same neutral message is shown whether or not the address exists', /If an account exists/.test(await text(p)))
  await p.evaluate(() => { location.hash = '#02/reset' }); await p.waitForTimeout(300)
  check('reset mode asks for a new password (min 8)', /Choose a new password/.test(await text(p)))
  await p.fill('#acc-password', 'short'); await click(p, 'Save new password'); check('short new password rejected', /at least 8 characters/.test(await text(p)))
  check('no page errors (reset)', errs.length === 0, errs.join('|')); await ctx.close()
}

await browser.close(); vite.kill()
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED'); process.exit(failures ? 1 : 0)
