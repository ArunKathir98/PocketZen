// An invite link looks like  https://<app>/?join=ABCDEFGHJKMN . We remember the ID until the person is signed in.
const KEY = 'pz:pendingJoin'

export function capturePendingJoin() {
  try {
    const p = new URLSearchParams(window.location.search).get('join')
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
