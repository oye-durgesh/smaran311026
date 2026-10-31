// Shared helpers for Edge Functions. Secrets are read from function secrets (Deno.env) only.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } })
}
export const fail = (status: number, error: string) => json({ error }, status)

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
}

/** Verifies the caller's JWT. Returns the user and a client that acts AS that user (so RLS still applies). */
export async function requireUser(req: Request): Promise<{ user: User; db: SupabaseClient } | Response> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return fail(401, 'Missing bearer token')
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  })
  const { data, error } = await db.auth.getUser(auth.slice(7))
  if (error || !data.user) return fail(401, 'Invalid or expired session')
  return { user: data.user, db }
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

export async function audit(db: SupabaseClient, ownerId: string, actor: string, action: string, detail = '') {
  // never put transcripts, health values or file contents in `detail`
  await db.from('audit_logs').insert({ owner_id: ownerId, actor, action, detail: detail.slice(0, 200) })
}
