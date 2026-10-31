// Inlines the single-bundle build into one HTML file: node scripts/inline-single.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const dir = 'dist-single'
let html = readFileSync(join(dir, 'index.html'), 'utf8')
const assets = readdirSync(join(dir, 'assets'))
for (const f of assets.filter((f) => f.endsWith('.css'))) {
  const css = readFileSync(join(dir, 'assets', f), 'utf8')
  html = html.replace(new RegExp(`<link[^>]*href="[^"]*${f}"[^>]*>`), () => `<style>${css}</style>`)
}
for (const f of assets.filter((f) => f.endsWith('.js'))) {
  const js = readFileSync(join(dir, 'assets', f), 'utf8').replace(/<\/script/g, '<\\/script')
  html = html.replace(new RegExp(`<script[^>]*src="[^"]*${f}"[^>]*></script>`), () => '')
  html = html.replace('</body>', () => `<script type="module">${js}</script></body>`)
}
writeFileSync(join(dir, 'smaran-demo.html'), html)
console.log('wrote', join(dir, 'smaran-demo.html'), (html.length / 1024).toFixed(0) + ' KB')
