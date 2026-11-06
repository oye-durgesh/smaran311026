// Opaque HMAC session for ElevenLabs tool calls.
// The model never supplies owner or family-member ids; the token is issued after a verified user JWT.

export type ToolRel = 'self' | 'mother' | 'father'
export type ToolAgent = 'mummy' | 'papa' | 'self'

export interface ToolClaims {
  uid: string
  mid: string
  rel: ToolRel
  ag: ToolAgent
  exp: number
  /** Server-validated triggering occurrence id. Never taken from the model. */
  oid?: string
}

const enc = new TextEncoder()

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const unb64url = (s: string) => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

const timingEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}

export async function signToolSession(secret: string, claims: Omit<ToolClaims, 'exp'>, ttlSec = 7200): Promise<string> {
  const body: ToolClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSec }
  const payload = b64url(enc.encode(JSON.stringify(body)))
  const sig = b64url(await hmac(secret, payload))
  return `v1.${payload}.${sig}`
}

export async function verifyToolSession(secret: string, token: string): Promise<ToolClaims | null> {
  if (typeof token !== 'string' || !token.startsWith('v1.')) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [, payload, sig] = parts
  const expected = b64url(await hmac(secret, payload))
  if (!timingEqual(unb64url(sig), unb64url(expected))) return null
  try {
    const claims = JSON.parse(new TextDecoder().decode(unb64url(payload))) as ToolClaims
    if (!claims.uid || !claims.mid || !claims.rel || !claims.ag || !claims.exp) return null
    if (claims.exp < Math.floor(Date.now() / 1000)) return null
    if (!['self', 'mother', 'father'].includes(claims.rel)) return null
    if (!['mummy', 'papa', 'self'].includes(claims.ag)) return null
    if (claims.oid != null && (typeof claims.oid !== 'string' || claims.oid.length > 160)) return null
    return claims
  } catch {
    return null
  }
}

export function agentForRel(rel: ToolRel): ToolAgent {
  return rel === 'mother' ? 'mummy' : rel === 'father' ? 'papa' : 'self'
}

export function relAllowedForAgent(ag: ToolAgent, rel: ToolRel): boolean {
  if (ag === 'mummy') return rel === 'mother'
  if (ag === 'papa') return rel === 'father'
  return rel === 'self'
}
