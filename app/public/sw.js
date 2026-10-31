/* Smaran service worker: shows reminder notifications (local or Web Push) and opens the incoming-call screen. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* non-json payload */ }
  const title = data.title || 'Smaran'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Time for your reminder',
    tag: data.reminderId || 'smaran',
    requireInteraction: true,
    data: { reminderId: data.reminderId, url: data.reminderId ? `/#17/${data.reminderId}` : '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) { if ('focus' in c) { await c.focus(); c.postMessage({ type: 'open', url }); return } }
    await self.clients.openWindow(url)
  })())
})
