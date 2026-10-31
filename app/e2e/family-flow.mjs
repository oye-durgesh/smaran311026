// Onboarding ("My own health" / "Helping a parent"), Mummy and Papa as separate profiles, persistence after refresh.
// Drives the real UI in Chromium against the local dev server. Run: npm run e2e:family   (NODE_PATH=$(npm root -g))
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const root = new URL('..', import.meta.url).pathname
const vite = spawn('npx', ['vite', '--port', '5196', '--strictPort'], { cwd: root, stdio: 'ignore' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return } catch {} await wait(300) } throw new Error('timeout') }
let failures = 0
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failures++ }
await until(async () => (await fetch('http://127.0.0.1:5196/')).ok)

const browser = await chromium.launch()
async function fresh() {
  const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
  const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://127.0.0.1:5196/#01'); await p.waitForFunction(() => window.__smaran)
  await p.evaluate(() => __smaran.wipeAll()); await p.reload(); await p.waitForFunction(() => window.__smaran)
  return { p, errs }
}
const click = async (p, t) => { await p.locator('.ph').getByText(t, { exact: true }).first().click(); await p.waitForTimeout(250) }
const hash = (p) => p.evaluate(() => location.hash.split('/')[0])
const st = (p) => p.evaluate(() => { const s = __smaran.store.get(); return { role: s.profile.role, onboarded: s.profile.onboarded, call: s.profile.callName, active: s.activePersonId, people: s.people.map((x) => ({ id: x.id, rel: x.relationship, label: x.relationshipLabel, name: x.displayName })) } })
async function toProfileStep(p, role) {
  await click(p, 'Get Started')
  await p.fill('#acc-name', 'Durgesh Kumar'); await p.fill('#acc-email', 'durgesh@example.com')
  if (role === 'parent') await p.locator('.ph').getByText('Helping a parent', { exact: true }).click()
  await click(p, 'Continue'); await click(p, 'English'); await click(p, 'Continue')
}

// ── A. "My own health" ──
{
  const { p, errs } = await fresh()
  await toProfileStep(p, 'self')
  await click(p, 'Custom'); await p.fill('input[aria-label="What should Sathi call you?"]', 'Dugu')   // Screen 04: a custom form of address
  await click(p, 'Slower'); await click(p, 'Extra')
  await click(p, 'Continue')
  await p.fill('#pf-name', 'Durgesh Kumar'); await click(p, 'Continue')
  let s = await st(p)
  check('self: goes straight to notifications (#06), no parent step', (await hash(p)) === '#06')
  check('self: the account holder’s own profile is active; there are no other profiles', s.people.length === 1 && s.people[0].rel === 'self' && s.active === s.people[0].id && s.onboarded, JSON.stringify(s))
  check('self: "Dugu" is how Sathi addresses the user, not a family member', s.call === 'Dugu' && s.people.length === 1)
  await p.reload(); await p.waitForFunction(() => window.__smaran)
  const pf = await p.evaluate(() => { const s = __smaran.store.get().profile; return [s.callName, s.speakingSpeed, s.textSize] })
  check('Screen 04 preferences survive a refresh', pf.join() === 'Dugu,slower,extra', pf.join())
  check('self: no Family members section on home', (await p.evaluate(() => { location.hash = '#14'; return 1 }), await p.waitForTimeout(400), (await p.getByText('Family members', { exact: true }).count()) === 0))
  check('no page errors (self)', errs.length === 0, errs.join('|'))
}

// ── B. "Helping a parent": Mummy, then Papa as a separate profile ──
{
  const { p, errs } = await fresh()
  await toProfileStep(p, 'parent')
  await click(p, 'Continue')                                   // 04 with the default address "Mummy" selected
  await p.fill('#pf-name', 'Durgesh Kumar'); await click(p, 'Continue')
  check('parent: leads to the parent-selection step (#49)', (await hash(p)) === '#49')
  let s = await st(p)
  check('parent: not yet onboarded until a parent is chosen', !s.onboarded)
  check('Screen 04 "Mummy" did not create or select a Mummy profile', s.people.length === 1 && s.people[0].rel === 'self' && s.active === s.people[0].id)
  await p.locator('.ph').getByText('Mummy', { exact: true }).first().click(); await p.fill('#fp-name', 'Sunita Kumar')
  await click(p, 'Continue')
  s = await st(p)
  const mum = s.people.find((x) => x.rel === 'mother')
  check('Mummy profile created with a stable id and made active', !!mum && s.active === mum.id && s.onboarded && (await hash(p)) !== '#49', JSON.stringify(s))
  // add Papa from the home screen
  await p.evaluate(() => { location.hash = '#13' }); await p.waitForTimeout(500)
  check('home shows a Family members section with Mummy', (await p.getByText('Family members', { exact: true }).count()) === 1 && (await p.getByLabel(/Sunita Kumar, open profile/).count()) === 1)
  await click(p, '+ Add a family member'); await p.locator('.ph').getByText('Papa', { exact: true }).first().click(); await p.fill('#fp-name', 'Ramesh Kumar'); await click(p, 'Continue')
  s = await st(p)
  const papa = s.people.find((x) => x.rel === 'father')
  check('Papa is a separate profile with a different id', !!papa && papa.id !== mum.id && s.people.length === 3, JSON.stringify(s.people))
  check('opening Papa lands on his own page (#50)', (await hash(p)) === '#50' && s.active === papa.id)
  // medicines per person (through the app's own actions), then verify each page shows only its own
  await p.evaluate(({ m, pa }) => {
    const A = __smaran, mk = (name) => ({ ...A.newDraftMedicine(), name, strength: '500mg', dose: '1 tablet', times: ['08:00'], food: 'after', status: 'confirmed' })
    A.setActivePerson(m); A.saveMedicine(mk('Metformin'))
    A.setActivePerson(pa); A.saveMedicine(mk('Amlodipine'))
  }, { m: mum.id, pa: papa.id })
  await p.evaluate((id) => { location.hash = '#50/' + id }, papa.id); await p.waitForTimeout(500)
  check('Papa’s page lists Amlodipine and not Metformin', (await p.getByText('Amlodipine').count()) > 0 && (await p.getByText('Metformin').count()) === 0)
  await p.evaluate((id) => { location.hash = '#50/' + id }, mum.id); await p.waitForTimeout(600)
  check('Mummy’s page lists Metformin and not Amlodipine', (await p.getByText('Metformin').count()) > 0 && (await p.getByText('Amlodipine').count()) === 0)
  // per-person settings
  await p.getByRole('button', { name: 'Slower' }).first().click(); await p.getByRole('button', { name: 'Dad' }).click()
  await p.evaluate((id) => { location.hash = '#50/' + id }, papa.id); await p.waitForTimeout(500)
  const pp = await p.evaluate(() => __smaran.store.get().people.map((x) => [x.relationship, x.speakingSpeed, x.sathiVoice].join(':')).sort())
  check('settings are per person (Mummy slower + Dad voice; Papa untouched)', pp.join() === 'father:normal:default,mother:slower:dad,self:normal:default', pp.join())
  // refresh keeps everything
  await p.reload(); await p.waitForFunction(() => window.__smaran)
  const s2 = await st(p)
  const meds = await p.evaluate(() => __smaran.store.get().medicines.map((m) => m.name + ':' + m.personId))
  check('profiles, active profile and medicine ownership survive a refresh', s2.people.length === 3 && meds.length === 2 && meds.includes('Metformin:' + mum.id) && meds.includes('Amlodipine:' + papa.id), JSON.stringify(meds))
  check('no page errors (parent)', errs.length === 0, errs.join('|'))
}

await browser.close(); vite.kill()
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED'); process.exit(failures ? 1 : 0)
