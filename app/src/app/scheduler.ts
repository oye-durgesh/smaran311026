import { onReminderFired, tick } from '../store/actions'
import { store } from '../store/store'
import { notificationPermission } from '../voice/speech'

/**
 * Local (in-tab) scheduler used for development and while the app is open. It is NOT the production delivery
 * path: real delivery while the app is closed comes from the server dispatcher (see supabase/functions).
 */
export function startScheduler(): () => void {
  tick()
  const id = setInterval(tick, 1000)
  const onVis = () => { if (document.visibilityState === 'visible') tick() }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', onVis)
  const stop = onReminderFired((r) => {
    if (document.visibilityState !== 'hidden' || notificationPermission() !== 'granted') return
    void showSystemNotification(r.id, r.title, r.kind === 'medicine' ? 'Time for your medicine' : 'Reminder')
  })
  return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); stop() }
}

export async function showSystemNotification(id: string, title: string, body: string) {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    const opts: NotificationOptions = { body, tag: id, requireInteraction: true, data: { reminderId: id, url: `/#17/${id}` } }
    if (reg) await reg.showNotification(title, opts)
    else new Notification(title, opts)
    const { recordDelivery } = await import('../store/actions')
    recordDelivery(id, { at: new Date(Date.now() + store.get().demo.clockOffsetMs).toISOString(), channel: 'notification', outcome: 'delivered' })
  } catch {
    const { recordDelivery } = await import('../store/actions')
    recordDelivery(id, { at: new Date(Date.now() + store.get().demo.clockOffsetMs).toISOString(), channel: 'notification', outcome: 'failed', note: 'could not show notification' })
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  try { await navigator.serviceWorker.register('/sw.js') } catch { /* dev servers without https may refuse; notifications fall back to Notification() */ }
}
