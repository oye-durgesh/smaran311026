/**
 * Optional Supabase gateway. With no VITE_SUPABASE_* the app stays in local demo mode.
 * Only the public anon key is used here. ElevenLabs and the service-role key never ship in the browser.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js'

export interface BackendConfig { url: string; anonKey: string }

export function backendConfig(): BackendConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  return url && anonKey ? { url: url.replace(/\/$/, ''), anonKey } : null
}
export const backendConfigured = () => backendConfig() !== null

let client: SupabaseClient | null = null
export async function getClient(): Promise<SupabaseClient> {
  const cfg = backendConfig()
  if (!cfg) throw new BackendError('Backend is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).', 0)
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  }
  return client
}

export class BackendError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}

export async function currentSession(): Promise<Session | null> {
  if (!backendConfigured()) return null
  const { data } = await (await getClient()).auth.getSession()
  return data.session
}
export async function hasSession(): Promise<boolean> { return (await currentSession()) !== null }

export async function signOut(): Promise<void> {
  if (!backendConfigured()) return
  await (await getClient()).auth.signOut()
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const MIN_PASSWORD = 8
const redirectTo = () => `${window.location.origin}${window.location.pathname}`

function friendlyAuthError(m: string): string {
  if (/invalid login|invalid credentials/i.test(m)) return 'The email or password is not correct.'
  if (/email not confirmed/i.test(m)) return 'Check the email and password, or reset the password.'
  if (/already registered|already been registered/i.test(m)) return 'This email already has an account. Try signing in.'
  if (/password.*(short|least|weak|characters)/i.test(m)) return 'Please choose a longer password (at least 8 characters).'
  if (/invalid.*email|valid email/i.test(m)) return 'Please enter a valid email address.'
  if (/rate|too many/i.test(m)) return 'Too many attempts. Please wait a minute and try again.'
  return m
}

export async function signUpEmail(email: string, password: string, fullName: string): Promise<void> {
  const db = await getClient()
  const { data, error } = await db.auth.signUp({
    email: email.trim(), password,
    options: { data: { full_name: fullName.trim() }, emailRedirectTo: redirectTo() },
  })
  if (error) throw new BackendError(friendlyAuthError(error.message), error.status ?? 0)
  if (data.session) return
  if (data.user && (data.user.identities?.length ?? 0) === 0) throw new BackendError('This email already has an account. Try signing in.', 0)
  const signed = await db.auth.signInWithPassword({ email: email.trim(), password })
  if (signed.error || !signed.data.session) throw new BackendError(friendlyAuthError(signed.error?.message ?? 'Could not sign in after creating the account.'), signed.error?.status ?? 0)
}

export async function signInEmail(email: string, password: string): Promise<void> {
  const { data, error } = await (await getClient()).auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.session) throw new BackendError(friendlyAuthError(error?.message ?? 'Could not sign in'), error?.status ?? 0)
}

export async function onAuthEvent(cb: (event: string, session: Session | null) => void): Promise<() => void> {
  const { data } = (await getClient()).auth.onAuthStateChange((e, s) => cb(e, s))
  return () => data.subscription.unsubscribe()
}

export async function callFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const cfg = backendConfig()
  if (!cfg) throw new BackendError('Backend is not configured.', 0)
  const session = await currentSession()
  if (!session) throw new BackendError('Please sign in first.', 401)
  const res = await fetch(`${cfg.url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const parsed = await res.json().catch(() => ({})) as { error?: string; code?: string } & T
  if (!res.ok) throw new BackendError(parsed.error ?? `Request failed (${res.status})`, res.status, parsed.code)
  return parsed
}
