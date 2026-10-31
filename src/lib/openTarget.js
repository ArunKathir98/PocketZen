// Where a notification tap (or an in-app toast, or a ?open=… link) should take the user.
// A target is remembered until App.jsx can act on it (it may be waiting for the PIN screen or for data to load).
const KEY = 'pz:open'
const ALLOWED = new Set(['add', 'records', 'analysis', 'reminders', 'loans', 'emi', 'groups', 'budget', 'accounts'])
const subs = new Set()

export function setOpenTarget(target) {
  if (!ALLOWED.has(target)) return
  try { localStorage.setItem(KEY, target) } catch { /* storage blocked */ }
  subs.forEach((f) => f())
}

export const takeOpenTarget = () => {
  try {
    const t = localStorage.getItem(KEY)
    if (t) localStorage.removeItem(KEY)
    return ALLOWED.has(t) ? t : ''
  } catch { return '' }
}

export const onOpenTarget = (fn) => {
  subs.add(fn)
  return () => subs.delete(fn)
}

/** Call once at startup: reads ?open=… and listens for the service worker's "pz-open" message. */
export function captureOpenTarget() {
  try {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('open')
    if (t) {
      url.searchParams.delete('open') // keep any other parameter (e.g. ?view=…) for its own handler
      window.history.replaceState(null, '', url.pathname + url.search)
      setOpenTarget(t)
    }
  } catch { /* ignore */ }
  try {
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.type === 'pz-open') setOpenTarget(e.data.target)
    })
  } catch { /* no service worker */ }
}
