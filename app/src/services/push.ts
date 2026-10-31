/** Web Push registration so the SERVER can deliver reminders while the app is closed (see supabase/functions/dispatch-reminders). */
import { backendConfigured, currentSession, getClient } from './backend'
import { newIdFor } from './pushId'

const b64ToUint8 = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export type PushResult = { ok: true } | { ok: false; reason: string }

export async function registerPush(): Promise<PushResult> {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!backendConfigured()) return { ok: false, reason: 'Server delivery is not configured (local demo mode).' }
  if (!key) return { ok: false, reason: 'VITE_VAPID_PUBLIC_KEY is not set.' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, reason: "This browser doesn't support push notifications." }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return { ok: false, reason: 'Notification permission has not been granted.' }
  const session = await currentSession()
  if (!session) return { ok: false, reason: 'Sign in first.' }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) }))
    const json = sub.toJSON()
    const db = await getClient()
    const { error } = await db.from('device_tokens').upsert({ id: newIdFor(sub.endpoint), owner_id: session.user.id, kind: 'webpush', endpoint: sub.endpoint, subscription: json, last_seen_at: new Date().toISOString() }, { onConflict: 'endpoint' })
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not register this device.' }
  }
}
