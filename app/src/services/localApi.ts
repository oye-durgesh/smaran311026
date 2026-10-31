/** Local development API (npm run dev:api). Only reachable from this machine; used when no Supabase session exists. */
export interface LocalHealth {
  ok: boolean; configured: boolean; mode: 'local-dev'
  elevenlabs: { key: boolean; agent: boolean; voices: Record<'default' | 'mom' | 'dad', boolean> }
}
let cache: { at: number; v: LocalHealth | null } | null = null
export async function localHealth(force = false): Promise<LocalHealth | null> {
  if (import.meta.env.VITE_LOCAL_API !== 'true') return null // not using `npm run dev:api`: make no request at all
  if (!force && cache && Date.now() - cache.at < 10_000) return cache.v
  let v: LocalHealth | null = null
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) { const j = await r.json(); if (j?.mode === 'local-dev') v = j }
  } catch { /* no dev API */ }
  cache = { at: Date.now(), v }
  return v
}
