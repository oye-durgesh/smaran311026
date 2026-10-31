// Turns the ZIP that Sarvam returns into plain text lines. The ZIP holds manifest.json, <name>/<name>.(md|html|json) and
// <name>/metadata/page_NNN.json. We never assume the API returns medicine objects; we read the primary document file.
import type { ErrorCode } from './extraction-types.ts'

export class OutputError extends Error {
  code: ErrorCode
  constructor(code: ErrorCode, message: string) { super(message); this.code = code }
}

export type Unzip = (data: Uint8Array) => Record<string, Uint8Array>

const dec = (b: Uint8Array) => new TextDecoder('utf-8').decode(b)

export interface PrimaryFile { name: string; format: 'md' | 'html' | 'json'; text: string }

/** Pick the primary document file for the requested format (never manifest.json or metadata/*). */
export function readPrimaryFile(zip: Uint8Array, unzip: Unzip, wanted: 'md' | 'html' | 'json'): PrimaryFile {
  let files: Record<string, Uint8Array>
  try { files = unzip(zip) } catch { throw new OutputError('no_output', 'The reader output could not be opened (not a valid ZIP).') }
  const names = Object.keys(files).filter((n) => !n.endsWith('/') && !/(^|\/)metadata\//.test(n) && !/(^|\/)manifest\.json$/i.test(n) && !/(^|\/)__MACOSX\//.test(n))
  const ext: Record<string, string[]> = { md: ['.md', '.markdown'], html: ['.html', '.htm'], json: ['.json'] }
  const order: Array<'md' | 'html' | 'json'> = [wanted, ...(['md', 'html', 'json'] as const).filter((f) => f !== wanted)]
  for (const fmt of order) {
    const hit = names.filter((n) => ext[fmt].some((e) => n.toLowerCase().endsWith(e))).sort()[0]
    if (hit) return { name: hit, format: fmt, text: dec(files[hit]) }
  }
  throw new OutputError('no_output', 'The reader output did not contain a document file.')
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
const decodeEntities = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
  return ENT[e.toLowerCase()] ?? m
})

/** HTML → text. Table cells become " | " separated so rows survive as one line. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(td|th)>\s*/gi, ' | ')
      .replace(/<\/(tr|p|div|li|h[1-6]|table|ul|ol|section)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).split('\n').map((l) => l.replace(/\s*\|\s*$/, '').replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
}

/** Sarvam JSON output is "blocks containing text, tag and bounding box". We collect every text string in reading order. */
export function jsonToText(json: string): string {
  let data: unknown
  try { data = JSON.parse(json) } catch { throw new OutputError('no_output', 'The reader JSON output could not be read.') }
  const out: string[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.text === 'string') out.push(o.text)
      else if (typeof o.content === 'string') out.push(o.content)
      for (const [k, x] of Object.entries(o)) if (k !== 'text' && k !== 'content' && k !== 'bbox' && k !== 'bounding_box' && k !== 'tag') walk(x)
    }
  }
  walk(data)
  return out.map((t) => t.trim()).filter(Boolean).join('\n')
}

/** Markdown → plain text, keeping table rows as "a | b | c". */
export function markdownToText(md: string): string {
  return md
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map((l) => l.replace(/^\s{0,3}#{1,6}\s*/, '').replace(/^\s*>\s?/, '').replace(/\*\*|__|`/g, '').trim())
    .filter((l) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l))
    .map((l) => (l.startsWith('|') ? l.replace(/^\|\s*/, '').replace(/\s*\|$/, '') : l))
    .join('\n')
}

export function primaryToText(p: PrimaryFile): string {
  return p.format === 'html' ? htmlToText(p.text) : p.format === 'json' ? jsonToText(p.text) : markdownToText(p.text)
}
