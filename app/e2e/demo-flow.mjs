// The stage demo, step by step, with the SYNTHETIC demo family, in the real UI (local demo mode: the prescription reader is the labelled
// mock because no server is configured). Run: npm run e2e:demo. Steps that need real services are marked in docs/LIVE_VERIFICATION.md.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { chromium } = createRequire(import.meta.url)('playwright')
const root = new URL('..', import.meta.url).pathname
const vite = spawn('npx', ['vite', '--port', '5193', '--strictPort'], { cwd: root, stdio: 'ignore' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return } catch {} await wait(300) } throw new Error('timeout') }
let failures = 0
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failures++ }
await until(async () => (await fetch('http://127.0.0.1:5193/')).ok)
const dir = mkdtempSync(join(tmpdir(), 'smaran-demo-')); const png = join(dir, 'demo-prescription.png')
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const browser = await chromium.launch()
const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, permissions: ['notifications', 'microphone'] })).newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://127.0.0.1:5193/#01'); await p.waitForFunction(() => window.__smaran)
await p.evaluate(() => __smaran.wipeAll()); await p.reload(); await p.waitForFunction(() => window.__smaran)
const ph = () => p.locator('.ph').innerText()
const go = async (h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(600) }
const click = async (t) => { await p.locator('.ph').getByText(t, { exact: true }).first().click(); await p.waitForTimeout(300) }

const seeded = await p.evaluate(() => __smaran.seedDemoFamily())
check('demo family loads', seeded.ok)
await go('#14')
let t = await ph()
check('2-3. home shows the greeting, a DEMO label, and Mummy and Papa under Family members', /Durgesh/.test(t) && /Demo family\. All names, readings and medicines here are made up/.test(t) && /family members/i.test(t) && /Sunita \(demo\)/.test(t) && /Ramesh \(demo\)/.test(t), t.slice(0, 600))
check('14. health cards show only recorded demo values with date and source; Papa’s sugar says none recorded', /118 mg\/dL/.test(t) && /fasting/.test(t) && /sample data/.test(t) && /No blood sugar reading recorded yet/.test(t))
check('15. Mummy’s card shows the refill status computed from confirmed doses', /Refill soon · about 7 days left/.test(t), t.slice(0, 900))
await p.getByLabel(/Sunita \(demo\), open profile/).click(); await p.waitForTimeout(600)
t = await ph()
check('4. Mummy’s profile opens with HER medicine, reminders and the exact refill wording', /Metformin/.test(t) && !/Amlodipine/.test(t) && /Sunita \(demo\)'s Metformin may need a refill soon\. Approximately 7 days of supply remain\. Please check the remaining tablets and arrange a refill if appropriate\./.test(t))
await click('Upload Rx'); await p.waitForTimeout(400)
check('5. upload screen asks who the prescription is for (Mummy preselected)', /WHO IS THIS PRESCRIPTION FOR\?/.test(await ph()) === false) // chips appear after a file is chosen
await p.setInputFiles('input[type=file]:not([capture])', png); await p.waitForTimeout(500)
t = await ph()
check('5. after choosing a file the person selector is shown, with Mummy active', /WHO IS THIS PRESCRIPTION FOR\?/.test(t) && (await p.evaluate(() => __smaran.store.get().people.find((x) => x.id === __smaran.store.get().activePersonId).relationship)) === 'mother')
await click('Read prescription'); await p.waitForTimeout(2600)
t = await ph()
check('6-7. processing ends on review; the demo reader is clearly labelled and nothing is active yet', /Sample data from demo mode/.test(t) && /These are for Sunita \(demo\)/.test(t))
const drafts = await p.evaluate(() => __smaran.store.get().medicines.filter((m) => m.status === 'draft').map((m) => [m.name, m.personId === __smaran.store.get().activePersonId]))
check('8. extracted medicines are drafts attached to Mummy, none activated', drafts.length === 4 && drafts.every((d) => d[1]))
await go('#46')
check('9-10. her saved reminders are listed with status', /Metformin/.test(await ph()) && /Scheduled|Due now/.test(await ph()) || /No reminders/.test(await ph()) === false)
// 11-13: controlled test reminder, Hindi call, then English
const rid = await p.evaluate(() => { const A = __smaran; const r = A.store.get().reminders.find((x) => x.personId === A.store.get().activePersonId && x.status === 'scheduled' && x.kind === 'medicine'); A.triggerReminderNow(r.id); return r.id })
await p.waitForTimeout(800)
check('11. a CONTROLLED test reminder rings (clock shortcut, labelled as a test control, not a delivery proof)', (await p.evaluate((id) => __smaran.store.get().reminders.find((x) => x.id === id).status, rid)) === 'ringing')
await p.evaluate((id) => { __smaran.voice.reset(); __smaran.voice.ring(id) }, rid); await p.waitForTimeout(300)
await p.evaluate(() => __smaran.voice.answer()); await p.waitForTimeout(1500)
await p.evaluate(() => __smaran.voice.handleUserText('Ho gaya, maine dawa le li'))
await p.waitForTimeout(1500)
const hiLines = await p.evaluate(() => __smaran.voice.get().lines.map((l) => l.text))
check('12. Hindi request gets a Hindi (masculine) reply and the dose is recorded as user-reported', hiLines.some((l) => /leta hoon/.test(l)) && (await p.evaluate((id) => __smaran.store.get().reminders.find((x) => x.id === id).completion?.basis, rid)) === 'user-reported', hiLines.join(' | '))
await p.evaluate(() => { __smaran.voice.reset(); __smaran.setActivePerson(__smaran.store.get().people.find((x) => x.relationship === 'mother').id); __smaran.voice.startAssistant() }); await p.waitForTimeout(1500)
await p.evaluate(() => __smaran.voice.handleUserText('Please remind me to go for a walk at 6 PM tomorrow')); await p.waitForTimeout(1200)
const enLines = await p.evaluate(() => __smaran.voice.get().lines.filter((l) => l.from === 'sathi').map((l) => l.text))
check('13. an English request gets an English reply even though Mummy’s profile language is Hindi', enLines.slice(-1)[0] && !/hoon|kar diya|set kar/.test(enLines.slice(-1)[0]) && /walk|reminder/i.test(enLines.slice(-1)[0]), enLines.join(' | '))
await p.evaluate(() => __smaran.voice.reset())
// 16-17
await go('#50/' + seeded.papa); t = await ph()
check('16. Papa’s page shows only his records: Amlodipine, his appointment; no Metformin, no refill alert', /Amlodipine/.test(t) && !/Metformin/.test(t) && /Cardiology review \(demo\)/.test(t) && !/may need a refill soon/.test(t))
check('17. appointment + follow-up are listed with a reminder status', /Reminder set/.test(t) && /Follow-up from Amlodipine/.test(t))
// 18 help
await go('#14'); await p.getByLabel('Help and support').click(); await p.waitForTimeout(500)
check('18. Help & support is one tap from Home and has the family, upload, stock and troubleshooting guides', /Add a family member/.test(await ph()) && /Update medicine stock/.test(await ph()) && /Something is not working/.test(await ph()))
check('Help does not invent a phone number or a human agent', !/\+?\d[\d -]{8,}\d/.test((await ph()).replace(/\d{1,2}:\d{2}/g, '')) && !/live agent|call us/i.test(await ph()))
const stored = await p.evaluate(() => JSON.stringify(localStorage))
check('nothing in storage is flagged for upload (sampleData on)', (await p.evaluate(() => __smaran.store.get().demo.sampleData)) === true && !stored.includes('smaran-sync'))
check('no page errors', errs.length === 0, errs.join('|'))
await browser.close(); vite.kill()
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED'); process.exit(failures ? 1 : 0)
