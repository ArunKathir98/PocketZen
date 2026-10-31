// Extra service-worker logic (loaded by the generated Workbox SW via importScripts).
//
// Tapping a notification must always bring the app forward and tell it what to open:
//   data.open = 'add' | 'reminders' | 'loans' | …   (handled by src/lib/openTarget.js)
// Anything that goes wrong while focusing an existing window falls back to opening a new one,
// so a tap can never silently do nothing.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.open) || ''
  const url = '/' + (target ? '?open=' + encodeURIComponent(target) : '')

  event.waitUntil(
    (async () => {
      let windows = []
      try {
        windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      } catch (e) { /* fall through to openWindow */ }
      const mine = windows.filter((w) => {
        try { return new URL(w.url).origin === self.location.origin } catch (e) { return false }
      })
      const win = mine.find((w) => w.focused) || mine[0]
      if (win) {
        try {
          await win.focus()
          win.postMessage({ type: 'pz-open', target })
          return
        } catch (e) { /* the window refused focus: open a new one below */ }
      }
      try {
        await clients.openWindow(url)
      } catch (e) { /* nothing more we can do */ }
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
      badge: '/notif-badge.png',
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      data: { open: d.open || '' },
    }),
  )
})
