export const notificationsSupported = () => typeof Notification !== 'undefined'

let ctx
/** Browsers only allow audio after a user gesture – call this from any tap/click. */
export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
  } catch { /* no audio available */ }
}

export function playChime() {
  unlockAudio()
  if (!ctx) return
  const t = ctx.currentTime
  ;[[880, 0], [1175, 0.2], [1568, 0.4]].forEach(([freq, d]) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t + d)
    g.gain.exponentialRampToValueAtTime(0.28, t + d + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7)
    o.connect(g).connect(ctx.destination)
    o.start(t + d)
    o.stop(t + d + 0.75)
  })
}

export const vibrate = () => navigator.vibrate?.([200, 100, 200, 100, 200])

/** System notification via the service worker (shows when the app isn't in the foreground). */
export async function systemNotify({ title, body, tag }, sound = true) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  const opts = { body, tag, icon: '/pwa-192.png', badge: '/favicon.png', renotify: true, requireInteraction: true, data: { url: '/' } }
  // `silent: true` and `vibrate` can't be combined, and silent also mutes vibration.
  if (sound) opts.vibrate = [200, 100, 200, 100, 200]
  else opts.silent = true
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg?.showNotification) {
      await reg.showNotification(title, opts)
      return true
    }
  } catch { /* fall through */ }
  try {
    new Notification(title, opts)
    return true
  } catch {
    return false
  }
}

/** In the foreground: chime + vibration. In the background: a system notification. */
export function fireReminder(n, settings = {}, { force = false } = {}) {
  const sound = settings.notifySound !== false
  if (document.visibilityState === 'visible') {
    if (sound) {
      playChime()
      vibrate()
    }
    if (force) systemNotify(n, sound)
  } else systemNotify(n, sound)
}
