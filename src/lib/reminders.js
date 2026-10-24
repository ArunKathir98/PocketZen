import { addDays, parseDate, toDateStr } from './util'
import { fireReminder, notificationsSupported } from './notify'
import { hasMonthlyCycle, loanLabel, loanStats } from './loans'

export { notificationsSupported }

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


export async function askNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

/** Checks due reminders / the daily nudge. Returns in-app messages for anything that fired. */
export function checkDue(data, now = new Date()) {
  const fired = getFired()
  const messages = []
  for (const r of data.settings.showReminders ? data.reminders : []) {
    const o = nextOccurrence(r)
    if (!o || o > now) continue
    const key = `r:${r.id}:${r.doneCount || 0}`
    if (fired[key]) continue
    markFired(key)
    const body = r.amount ? `Due now · ${r.title}` : r.title
    fireReminder({ title: `Bill reminder: ${r.title}`, body, tag: key }, data.settings)
    messages.push({ id: key, title: r.title, body: 'Bill is due' })
  }
  if (data.settings.showLoans) {
    const today = toDateStr(now)
    const ym = today.slice(0, 7)
    for (const l of data.loans || []) {
      if (!l.remind) continue
      const who = (data.people || []).find((p) => p.id === l.personId)?.name || 'someone'
      const st = loanStats(l, today)
      if (st.settled) continue
      const fmt = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: data.settings.currency || 'INR' }).format(n)
      // monthly interest day (the loan's start day, clamped to the month length)
      if (hasMonthlyCycle(l) && st.principalBalance > 0) {
        const [y, m] = [now.getFullYear(), now.getMonth()]
        const day = Math.min(Number(l.startDate.slice(8, 10)), new Date(y, m + 1, 0).getDate())
        const at = new Date(y, m, day, 9, 0)
        const key = `loan:${l.id}:${ym}`
        if (now >= at && !fired[key]) {
          markFired(key)
          const body = st.interestDue > 0 ? `Interest due ${fmt(st.interestDue)}` : 'Interest day'
          const title = l.direction === 'lent' ? `Collect interest from ${who}` : `Pay interest to ${who}`
          fireReminder({ title, body, tag: key }, data.settings)
          messages.push({ id: key, title, body })
        }
      }
      // final repayment date
      if (l.dueDate && today >= l.dueDate) {
        const key = `loandue:${l.id}`
        if (!fired[key]) {
          markFired(key)
          const title = l.direction === 'lent' ? `${who} should repay today` : `Repay ${who} today`
          const body = `${loanLabel(l)} · outstanding ${fmt(st.outstanding)}`
          fireReminder({ title, body, tag: key }, data.settings)
          messages.push({ id: key, title, body })
        }
      }
    }
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
        fireReminder({ title: 'PocketZen', body: "Don't forget to add today's expenses.", tag: key }, data.settings)
        messages.push({ id: key, title: 'Daily reminder', body: "Don't forget to add today's expenses." })
      }
    }
  }
  return messages
}

export { parseDate }
