// A group link looks like  https://<app>/?view=<group id> . We remember the id until the person is done with it.
const KEY = 'pz:pendingJoin'

export function capturePendingJoin() {
  try {
    const q = new URLSearchParams(window.location.search)
    const p = q.get('view') || q.get('join')
    if (p) {
      localStorage.setItem(KEY, p)
      window.history.replaceState(null, '', window.location.pathname)
    }
  } catch { /* ignore */ }
}
export const getPendingJoin = () => {
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}
export const clearPendingJoin = () => {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
