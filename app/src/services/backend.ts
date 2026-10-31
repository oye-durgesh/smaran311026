/**
 * Backend gateway (Supabase). Optional: with no VITE_SUPABASE_* variables the app runs in local demo mode and every
 * caller falls back to local behaviour. Only the public anon key is ever used here; private provider keys
 * (Sarvam, ElevenLabs, VAPID private, service role) live only in Edge Function secrets.
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
    client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
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

// ── email + password auth (Supabase Auth; passwords are never handled or stored by this app) ──
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const MIN_PASSWORD = 8
const redirectTo = () => `${window.location.origin}${window.location.pathname}`

export type SignUpResult = 'signed-in'
/** Creates the account. Email confirmation is off, so a session is expected immediately. Password reset still uses an email link. */
export async function signUpEmail(email: string, password: string, fullName: string): Promise<SignUpResult> {
  const db = await getClient()
  const { data, error } = await db.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() }, emailRedirectTo: redirectTo() } })
  if (error) throw new BackendError(friendlyAuthError(error.message), error.status ?? 0)
  if (data.session) return 'signed-in'
  // Duplicate sign-up is returned as a user with no identities and no error (does not reveal whether the email exists).
  if (data.user && (data.user.identities?.length ?? 0) === 0) throw new BackendError('This email already has an account. Try signing in.', 0)
  const signed = await db.auth.signInWithPassword({ email: email.trim(), password })
  if (signed.error || !signed.data.session) throw new BackendError(friendlyAuthError(signed.error?.message ?? 'Could not sign in after creating the account.'), signed.error?.status ?? 0)
  return 'signed-in'
}
export async function signInEmail(email: string, password: string): Promise<Session> {
  const { data, error } = await (await getClient()).auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.session) throw new BackendError(friendlyAuthError(error?.message ?? 'Could not sign in'), error?.status ?? 0)
  return data.session
}
export async function resendVerification(email: string): Promise<void> {
  const { error } = await (await getClient()).auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectTo() } })
  if (error) throw new BackendError(friendlyAuthError(error.message), error.status ?? 0)
}
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await (await getClient()).auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() })
  if (error) throw new BackendError(friendlyAuthError(error.message), error.status ?? 0)   // the same message is shown whether or not the address exists
}
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await (await getClient()).auth.updateUser({ password })
  if (error) throw new BackendError(friendlyAuthError(error.message), error.status ?? 0)
}
/** Fires with 'PASSWORD_RECOVERY' when the user opens the reset link, 'SIGNED_IN' after email verification, 'SIGNED_OUT' on logout. */
export async function onAuthEvent(cb: (event: string, session: Session | null) => void): Promise<() => void> {
  const { data } = (await getClient()).auth.onAuthStateChange((e, s) => cb(e, s))
  return () => data.subscription.unsubscribe()
}

// ── phone OTP auth (OPTIONAL, not used by sign-up; kept for a future explicit "sign in with phone" option) ──
export async function sendOtp(phoneE164: string): Promise<void> {
  const { error } = await (await getClient()).auth.signInWithOtp({ phone: phoneE164 })
  if (error) throw new BackendError(friendlyAuthError(error.message), error.status ?? 0)
}
export async function verifyOtp(phoneE164: string, token: string): Promise<Session> {
  const { data, error } = await (await getClient()).auth.verifyOtp({ phone: phoneE164, token, type: 'sms' })
  if (error || !data.session) throw new BackendError(friendlyAuthError(error?.message ?? 'Could not sign in'), error?.status ?? 0)
  return data.session
}
function friendlyAuthError(m: string): string {
  if (/invalid login|invalid credentials/i.test(m)) return 'The email or password is not correct.'
  if (/email not confirmed/i.test(m)) return 'Could not sign in. Check the email and password, or reset the password.'
  if (/already registered|already been registered/i.test(m)) return 'This email already has an account. Try signing in.'
  if (/password.*(short|least|weak|characters)/i.test(m)) return 'Please choose a longer password (at least 8 characters).'
  if (/invalid.*email|valid email/i.test(m)) return 'Please enter a valid email address.'
  if (/invalid|expired|token/i.test(m)) return 'That code is not correct or has expired. Please try again.'
  if (/rate|too many|seconds|security purposes/i.test(m)) return 'Too many attempts. Please wait a minute and try again.'
  if (/provider|sms|twilio|disabled/i.test(m)) return 'Text-message sign-in is not set up on the server yet.'
  return m
}

/** Call a Supabase Edge Function with the signed-in user's JWT. */
export async function callFunction<T>(name: string, body?: FormData | Record<string, unknown>): Promise<T> {
  const res = await rawCall(name, body)
  return (await res.json()) as T
}
export async function callFunctionBlob(name: string, body: Record<string, unknown>): Promise<Blob> {
  return (await rawCall(name, body)).blob()
}
/** Calls a function whose JSON answer carries its own `status` (saved, needs_clarification, permission_denied, …). HTTP errors with a JSON body are
 *  returned, not thrown, so the caller can tell "denied" from "server down". Only a missing session or an unreachable server throws. */
export async function callFunctionLoose<T>(name: string, body: Record<string, unknown>): Promise<{ http: number; body: T | null }> {
  const cfg = backendConfig()
  if (!cfg) throw new BackendError('Backend is not configured.', 0)
  const session = await currentSession()
  if (!session) throw new BackendError('Please sign in first.', 401)
  const res = await fetch(`${cfg.url}/functions/v1/${name}`, {
    method: 'POST', headers: { apikey: cfg.anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  let parsed: T | null = null
  try { parsed = (await res.json()) as T } catch { /* not json */ }
  return { http: res.status, body: parsed }
}
/** Like callFunctionBlob but also returns the response headers (used to check which voice the server actually used). */
export async function callFunctionBlobWithHeaders(name: string, body: Record<string, unknown>): Promise<{ blob: Blob; headers: Headers }> {
  const res = await rawCall(name, body)
  return { blob: await res.blob(), headers: res.headers }
}
async function rawCall(name: string, body?: FormData | Record<string, unknown>): Promise<Response> {
  const cfg = backendConfig()
  if (!cfg) throw new BackendError('Backend is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).', 0)
  const session = await currentSession()
  if (!session) throw new BackendError('Please sign in first.', 401)
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const res = await fetch(`${cfg.url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${session.access_token}`, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
    body: isForm ? (body as FormData) : JSON.stringify(body ?? {}),
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`, code: string | undefined
    try { const j = await res.json(); msg = j.error ?? msg; code = j.code } catch { /* not json */ }
    throw new BackendError(msg, res.status, code)
  }
  return res
}
