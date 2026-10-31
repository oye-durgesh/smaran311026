// Accessible-name sweep for the screens added after the original 48 (49, 50, 51) and the Help guides: every input has a label,
// every button has text or an aria-label, nothing overflows the phone width. Run: node e2e/a11y-new-screens.mjs (NODE_PATH=$(npm root -g))
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const vite = spawn('npx', ['vite', '--port', '5192', '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:5192/')).ok) break } catch {} await wait(300) }
const browser = await chromium.launch(); const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await p.goto('http://127.0.0.1:5192/#01'); await p.waitForFunction(() => window.__smaran)
await p.evaluate(() => __smaran.wipeAll()); await p.reload(); await p.waitForFunction(() => window.__smaran)
const ids = await p.evaluate(() => __smaran.seedDemoFamily())
let bad = 0
for (const h of ['#49', '#49/add', '#50/' + ids.mum, '#51/abcdefghjk', '#47', '#31', '#14', '#20', '#02', '#02/signin']) {
  await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(500)
  const r = await p.evaluate(() => {
    const ph = document.querySelector('.ph'); const out = []
    for (const el of ph.querySelectorAll('input, select, textarea')) {
      const hasLabel = el.getAttribute('aria-label') || (el.id && ph.querySelector(`label[for="${el.id}"]`)) || el.closest('label')
      if (!hasLabel) out.push('input without label: ' + (el.id || el.outerHTML.slice(0, 60)))
    }
    for (const el of ph.querySelectorAll('[role=button], button, [role=radio], [role=switch]')) {
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim()
      if (!name) out.push('control without name: ' + el.outerHTML.slice(0, 80))
    }
    if (ph.scrollWidth > ph.clientWidth + 1) out.push(`horizontal overflow ${ph.scrollWidth}>${ph.clientWidth}`)
    return out
  })
  console.log(`${r.length ? 'FAIL' : 'PASS'}  ${h}${r.length ? '  ' + r.join(' | ') : ''}`); bad += r.length
}
await browser.close(); vite.kill(); process.exit(bad ? 1 : 0)
