import { addDays, parseDate, toDateStr } from './util'

export const REPEATS = [
  { id: 'none', label: 'Once' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]

/** n-th occurrence (0-based) of a reminder, as a Date. dueAt is local 'YYYY-MM-DDTHH:mm'. */
export function occurrence(r, n) {
  const base = new Date(r.dueAt)
  if (isNaN(base)) return null
  if (r.repeat === 'daily') return addDays(base, n)
  if (r.repeat === 'weekly') return addDays(base, 7 * n)
  if (r.repeat === 'monthly') {
    const d = new Date(base)
    d.setDate(1)
    d.setMonth(base.getMonth() + n)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(base.getDate(), last))
    return d
  }
  return n === 0 ? base : null
}

/** The next occurrence that hasn't been marked done, or null when the series has ended. */
export function nextOccurrence(r) {
  const o = occurrence(r, r.doneCount || 0)
  if (!o) return null
  if (r.until && toDateStr(o) > r.until) return null
  return o
}

const FIRED_KEY = 'pz:fired'
const getFired = () => {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY)) || {}
  } catch {
    return {}
  }
}
const markFired = (key) => {
  const f = getFired()
  f[key] = Date.now()
  // keep the map small
  const keys = Object.keys(f)
  if (keys.length > 200) keys.sort((a, b) => f[a] - f[b]).slice(0, 100).forEach((k) => delete f[k])
  localStorage.setItem(FIRED_KEY, JSON.stringify(f))
}

export const notificationsSupported = () => typeof Notification !== 'undefined'

export async function askNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

async function show(title, body, tag) {
  if (notificationsSupported() && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker?.ready
      if (reg?.showNotification) {
        await reg.showNotification(title, { body, tag, icon: '/pwa-192.png', badge: '/favicon.png' })
        return
      }
    } catch { /* fall through */ }
    try { new Notification(title, { body, tag, icon: '/pwa-192.png' }) } catch { /* ignore */ }
  }
}

/** Checks due reminders / the daily nudge. Returns in-app messages for anything that fired. */
export function checkDue(data, now = new Date()) {
  const fired = getFired()
  const messages = []
  for (const r of data.reminders) {
    const o = nextOccurrence(r)
    if (!o || o > now) continue
    const key = `r:${r.id}:${r.doneCount || 0}`
    if (fired[key]) continue
    markFired(key)
    const body = r.amount ? `Due now · ${r.title}` : r.title
    show(`Bill reminder: ${r.title}`, body, key)
    messages.push({ id: key, title: r.title, body: 'Bill is due' })
  }
  const s = data.settings
  if (s.dailyReminder) {
    const [h, m] = (s.dailyReminderTime || '20:00').split(':').map(Number)
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
    const key = `daily:${toDateStr(now)}`
    if (now >= at && !fired[key]) {
      markFired(key)
      const todayStr = toDateStr(now)
      const hasToday = data.transactions.some((t) => t.date === todayStr)
      if (!hasToday) {
        show('PocketZen', "Don't forget to add today's expenses.", key)
        messages.push({ id: key, title: 'Daily reminder', body: "Don't forget to add today's expenses." })
      }
    }
  }
  return messages
}

export { parseDate }
