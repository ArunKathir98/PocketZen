// Extra service-worker logic (loaded by the generated Workbox SW via importScripts).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if ('focus' in c) return c.focus()
      }
      return clients.openWindow((event.notification.data && event.notification.data.url) || '/')
    })(),
  )
})

// Ready for Web Push (a server sending reminders while the app is closed).
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data.json()
  } catch (e) {
    d = { body: event.data && event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'PocketZen', {
      body: d.body || '',
      tag: d.tag,
      icon: '/pwa-192.png',
      badge: '/favicon.png',
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      data: { url: '/' },
    }),
  )
})
