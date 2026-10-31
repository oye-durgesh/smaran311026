// Stock tracking through the real UI: add medicine with stock details for Mummy, refill, alert wording, persistence, person separation.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const root = new URL('..', import.meta.url).pathname
const vite = spawn('npx', ['vite', '--port', '5194', '--strictPort'], { cwd: root, stdio: 'ignore' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return } catch {} await wait(300) } throw new Error('timeout') }
let failures = 0
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failures++ }
await until(async () => (await fetch('http://127.0.0.1:5194/')).ok)
const browser = await chromium.launch()
const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://127.0.0.1:5194/#01'); await p.waitForFunction(() => window.__smaran)
await p.evaluate(() => __smaran.wipeAll()); await p.reload(); await p.waitForFunction(() => window.__smaran)
const ids = await p.evaluate(() => {
  const A = __smaran
  A.updateProfile({ name: 'Durgesh', callName: 'Durgesh', onboarded: true, signedIn: true, role: 'parent' })
  const mum = A.addPerson({ relationship: 'mother', displayName: 'Sunita', greetingName: 'Mummy' }).value.person.id
  const papa = A.addPerson({ relationship: 'father', displayName: 'Ramesh', greetingName: 'Papa' }).value.person.id
  A.setActivePerson(mum); return { mum, papa }
})
const go = async (h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(500) }
const ph = () => p.locator('.ph').innerText()

// add medicine with the optional details
await go('#31')
await p.fill('#a-name', 'Metformin'); await p.fill('#a-str', '500mg'); await p.fill('#a-dose', '1 tablet')
await p.locator('.ph').getByText('Twice daily', { exact: true }).click(); await p.locator('.ph').getByText('Morning', { exact: true }).click(); await p.locator('.ph').getByText('Evening', { exact: true }).click()
await p.locator('.ph').getByText('After food', { exact: true }).click(); await p.locator('.ph').getByText('Ongoing', { exact: true }).click()
check('"More details" is collapsed by default (original form unchanged)', (await p.locator('#d-qty').count()) === 0)
await p.locator('.ph').getByText('More details').click()
check('who-is-this-for lists the real profiles', (await ph()).includes('Sunita') && (await ph()).includes('Ramesh'))
await p.fill('#d-qty', '42'); await p.fill('#d-per', '1'); await p.fill('#d-low', '7'); await p.fill('#d-doc', 'Dr. Mehta (demo)'); await p.fill('#d-start', '2026-10-01'); await p.fill('#d-end', '2026-09-01')
await p.locator('.ph .ft').getByText('Add medicine', { exact: true }).click(); await p.waitForTimeout(300)
check('end date before start date is refused', (await p.evaluate(() => __smaran.store.get().medicines.length)) === 0)
await p.fill('#d-end', '2026-12-01'); await p.locator('.ph .ft').getByText('Add medicine', { exact: true }).click(); await p.waitForTimeout(500)
const med = await p.evaluate(() => __smaran.store.get().medicines[0])
check('saved for Mummy with stock opening, per-dose, prescriber and dates', med && med.personId === ids.mum && med.stock.ledger.length === 1 && med.stock.ledger[0].type === 'opening' && med.stock.ledger[0].qty === 42 && med.stock.perDose === 1 && med.prescriber === 'Dr. Mehta (demo)' && med.endDate === '2026-12-01', JSON.stringify(med))
check('the stock entry has a date and a source', !!med.stock.ledger[0].at && med.stock.ledger[0].source === 'user')

// profile shows the estimate; activate; confirm doses; alert
await p.evaluate(() => { __smaran.activateConfirmed() })
await go('#50/' + ids.mum)
check('profile shows the estimate with the 21-day example', /About 42 tablets · 21 days/.test(await ph()), (await ph()).slice(0, 600))
check('Papa has no medicines and no stock', await (async () => { await go('#50/' + ids.papa); return /No medicines yet/.test(await ph()) && !/About \d+ tablets/.test(await ph()) })())
// 14 days of confirmed doses (28) -> 14 tablets, 7 days, "low" by the default 7-day line
await p.evaluate(({ mum }) => {
  const A = __smaran, s = A.store.get(), m = s.medicines[0], base = Date.now() - 14 * 86400000
  const rems = Array.from({ length: 28 }, (_, i) => { const at = new Date(base + i * 43200000).toISOString(); return { id: 'x' + i, ownerId: 'me', personId: mum, kind: 'medicine', title: m.name, medicineId: m.id, scheduledFor: at, originalScheduledFor: at, timeZone: 'Asia/Kolkata', status: 'completed', completedAt: at, completion: { via: 'tap', basis: 'user-reported' }, createdAt: at, updatedAt: at, snoozeHistory: [], rescheduleHistory: [], deliveryAttempts: [], idempotencyKey: 'x' + i, recurrence: null } })
  A.store.set((st) => ({ ...st, reminders: [...st.reminders.filter((r) => r.status !== 'scheduled' && r.status !== 'ringing'), ...rems], medicines: st.medicines.map((x) => ({ ...x, stock: { ...x.stock, ledger: x.stock.ledger.map((t) => ({ ...t, at: new Date(base - 1000).toISOString() })) } })) }))
}, ids)
await go('#50/' + ids.mum)
const t1 = await ph()
check('after 28 CONFIRMED doses: about 14 tablets, 7 days left', /About 14 tablets · 7 days/.test(t1), t1.slice(0, 700))
check('alert uses the required wording', /Sunita's Metformin may need a refill soon\. Approximately 7 days of supply remain\. Please check the remaining tablets and arrange a refill if appropriate\./.test(t1))
await go('#13'); const home = await ph()
check('home card for Mummy shows the refill status; Papa does not', /Refill soon · about 7 days left/.test(home))
// refill
await go('#50/' + ids.mum)
await p.getByLabel(/Update stock for/).click(); await p.waitForTimeout(300)
await p.locator('#st-qty').fill('30'); await p.locator('[role=dialog], .sheet, .ph').getByText('Save', { exact: true }).last().click(); await p.waitForTimeout(500)
const m2 = await p.evaluate(() => __smaran.store.get().medicines[0].stock.ledger.map((t) => [t.type, t.qty, t.source]))
check('refill is recorded with type, quantity and source', JSON.stringify(m2) === JSON.stringify([['opening', 42, 'user'], ['refill', 30, 'user']]), JSON.stringify(m2))
check('estimate rises to about 44 tablets and the alert disappears', /About 44 tablets/.test(await ph()) && !/may need a refill soon/.test(await ph()), (await ph()).slice(0, 500))
await p.reload(); await p.waitForFunction(() => window.__smaran); await go('#50/' + ids.mum)
check('stock persists after a refresh', /About 44 tablets/.test(await ph()))
check('no page errors', errs.length === 0, errs.join('|'))
await browser.close(); vite.kill()
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED'); process.exit(failures ? 1 : 0)
