import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { emptyData } from './defaults'
import { setCurrency, uid } from './util'
import { idbDel, idbGet, idbSet } from './idb'
import { mergeData } from './merge'
import * as google from './google'

const SESSION_KEY = 'pz:session'
const LOCAL_SUB = 'local'
const legacyKey = (sub) => `pz:data:${sub}` // older builds kept data in localStorage
const idbKey = (sub) => `data:${sub}`
const dirtyKey = (sub) => `pz:dirty:${sub}`
const LOCK_AFTER_MS = 60 * 1000

const readJson = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k))
  } catch {
    return null
  }
}

const normalize = (d) => {
  const base = emptyData()
  const out = { ...base, ...d, settings: { ...base.settings, ...(d?.settings || {}) } }
  for (const k of ['accounts', 'categories', 'transactions', 'budgets', 'reminders', 'emis', 'people', 'loans', 'groups']) if (!Array.isArray(out[k])) out[k] = base[k]
  return out
}

/** Loads a user's data from IndexedDB, migrating the old localStorage copy once. */
async function loadData(sub) {
  let d = await idbGet(idbKey(sub))
  if (!d) {
    const old = readJson(legacyKey(sub))
    if (old) {
      d = old
      await idbSet(idbKey(sub), d)
      localStorage.removeItem(legacyKey(sub))
    }
  }
  return normalize(d)
}

const localProfile = () => ({ sub: LOCAL_SUB, mode: 'local', name: 'This device', email: '', picture: '', since: Date.now() })

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  // The session never expires on its own: it is only removed by an explicit logout / erase.
  const [session, setSession] = useState(() => readJson(SESSION_KEY))
  const [data, setData] = useState(emptyData)
  const [ready, setReady] = useState(() => !readJson(SESSION_KEY))
  const [locked, setLocked] = useState(false)
  const [sync, setSync] = useState('idle') // idle | local | syncing | synced | offline | auth | error
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState('')

  const dataRef = useRef(data)
  const sessionRef = useRef(session)
  const pushTimer = useRef(null)
  const pushing = useRef(false)
  dataRef.current = data
  sessionRef.current = session

  const isLocal = session?.mode === 'local'

  useEffect(() => setCurrency(data.settings.currency), [data.settings.currency])

  // Load the saved data once at startup.
  useEffect(() => {
    const s = sessionRef.current
    if (!s) return
    let alive = true
    loadData(s.sub).then((d) => {
      if (!alive) return
      dataRef.current = d
      setData(d)
      setLocked(!!d.pin)
      if (s.mode === 'local') {
        setSync('local')
        navigator.storage?.persist?.() // ask the browser not to evict our data
      }
      setReady(true)
    })
    return () => { alive = false }
  }, [])

  const persistLocal = useCallback((sub, d) => idbSet(idbKey(sub), d), [])

  const classify = (e) => (!navigator.onLine || e instanceof TypeError ? 'offline' : /popup|auth|access_denied|immediate|interaction|login/i.test(e.message) || e.status === 401 || e.status === 403 ? 'auth' : 'error')

  const push = useCallback(async () => {
    const s = sessionRef.current
    if (!s || s.mode === 'local' || pushing.current) return
    pushing.current = true
    setSync('syncing')
    const snapshot = dataRef.current
    try {
      await google.driveSave(s.sub, snapshot, s.email)
      if (dataRef.current.updatedAt === snapshot.updatedAt) localStorage.removeItem(dirtyKey(s.sub))
      else schedulePush(500)
      setSync('synced')
    } catch (e) {
      setSync(classify(e))
    } finally {
      pushing.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const schedulePush = useCallback(
    (ms = 1500) => {
      clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(push, ms)
    },
    [push],
  )

  /** Pull from Drive and reconcile with the local copy (latest write wins). */
  const pull = useCallback(async () => {
    const s = sessionRef.current
    if (!s || s.mode === 'local') return
    setSync('syncing')
    try {
      const remote = await google.driveLoad(s.sub, s.email)
      const local = dataRef.current
      const dirty = !!localStorage.getItem(dirtyKey(s.sub))
      if (remote && (remote.updatedAt || 0) > (local.updatedAt || 0) && !dirty) {
        const next = normalize(remote)
        persistLocal(s.sub, next)
        dataRef.current = next
        setData(next)
        setSync('synced')
      } else if (!remote || dirty || (local.updatedAt || 0) > (remote.updatedAt || 0)) {
        await push()
      } else setSync('synced')
    } catch (e) {
      setSync(classify(e))
    }
  }, [persistLocal, push])

  // Keep-alive: on every launch, quietly get a fresh Drive token and sync.
  useEffect(() => {
    if (session && ready && session.mode !== 'local') pull()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sub, ready])

  // Retry when the network or the tab comes back; auto-lock after being away.
  useEffect(() => {
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else {
        if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS && dataRef.current.pin) setLocked(true)
        hiddenAt = 0
        const s = sessionRef.current
        if (s && s.mode !== 'local' && localStorage.getItem(dirtyKey(s.sub))) schedulePush(300)
      }
    }
    const onOnline = () => sessionRef.current && sessionRef.current.mode !== 'local' && pull()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
    }
  }, [pull, schedulePush])

  const commit = useCallback(
    (fn) => {
      const s = sessionRef.current
      const next = { ...fn(dataRef.current), updatedAt: Date.now() }
      dataRef.current = next
      setData(next)
      if (s) {
        persistLocal(s.sub, next)
        if (s.mode !== 'local') {
          localStorage.setItem(dirtyKey(s.sub), '1')
          schedulePush()
        }
      }
    },
    [persistLocal, schedulePush],
  )

  const startSession = useCallback(async (prof) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(prof))
    sessionRef.current = prof
    const d = await loadData(prof.sub)
    dataRef.current = d
    setData(d)
    setLocked(false)
    setSession(prof)
    setReady(true)
  }, [])

  const login = useCallback(async () => {
    setError('')
    setLoggingIn(true)
    try {
      await google.requestToken({ prompt: 'select_account' })
      const profile = await google.fetchProfile()
      await startSession({ ...profile, mode: 'google', since: Date.now() })
      setSync('idle')
    } catch (e) {
      setError(
        /popup_closed|access_denied/.test(e.message)
          ? 'Sign-in was cancelled.'
          : e.message || 'Could not sign in with Google.',
      )
    } finally {
      setLoggingIn(false)
    }
  }, [startSession])

  /** Use the app with no account: everything stays on this device. */
  const loginLocal = useCallback(async () => {
    setError('')
    await startSession(localProfile())
    setSync('local')
    navigator.storage?.persist?.()
  }, [startSession])

  /** Needs a user gesture – used by the "Reconnect" banner when silent refresh is blocked. */
  const reconnect = useCallback(async () => {
    const s = sessionRef.current
    if (!s || s.mode === 'local') return
    try {
      await google.requestToken({ prompt: '', hint: s.email })
      await pull()
    } catch {
      try {
        await google.requestToken({ prompt: 'select_account', hint: s.email })
        await pull()
      } catch (e) {
        setSync(classify(e))
      }
    }
  }, [pull])

  /** Log out (Google) or erase everything on this device (local-only mode). */
  const logout = useCallback(async () => {
    const s = sessionRef.current
    if (s && s.mode !== 'local') {
      if (localStorage.getItem(dirtyKey(s.sub))) {
        try { await google.driveSave(s.sub, dataRef.current, s.email) } catch { /* best effort */ }
      }
      google.signOutGoogle()
    }
    if (s) {
      await idbDel(idbKey(s.sub))
      localStorage.removeItem(legacyKey(s.sub))
      localStorage.removeItem(dirtyKey(s.sub))
    }
    localStorage.removeItem(SESSION_KEY)
    sessionRef.current = null
    dataRef.current = emptyData()
    setData(dataRef.current)
    setSession(null)
    setLocked(false)
    setSync('idle')
  }, [])

  /**
   * Local-only → Google. `next` is the dataset to keep (local, merged, or the one already on Drive).
   * It is stored under the Google account and pushed to Drive; the on-device local copy is removed.
   */
  const switchToGoogle = useCallback(async (profile, next) => {
    const prof = { ...profile, mode: 'google', since: Date.now() }
    const nd = { ...normalize(next), updatedAt: Date.now() }
    await idbSet(idbKey(prof.sub), nd)
    localStorage.setItem(dirtyKey(prof.sub), '1')
    await idbDel(idbKey(LOCAL_SUB))
    localStorage.setItem(SESSION_KEY, JSON.stringify(prof))
    sessionRef.current = prof
    dataRef.current = nd
    setData(nd)
    setSession(prof)
    setSync('syncing')
  }, [])

  /** Google → local-only. The full copy stays on this device; the Drive file is left untouched. */
  const disconnectGoogle = useCallback(async () => {
    const s = sessionRef.current
    if (!s || s.mode === 'local') return
    if (localStorage.getItem(dirtyKey(s.sub))) {
      try { await google.driveSave(s.sub, dataRef.current, s.email) } catch { /* best effort */ }
    }
    google.signOutGoogle()
    const prof = localProfile()
    await idbSet(idbKey(LOCAL_SUB), dataRef.current)
    await idbDel(idbKey(s.sub))
    localStorage.removeItem(dirtyKey(s.sub))
    localStorage.setItem(SESSION_KEY, JSON.stringify(prof))
    sessionRef.current = prof
    setSession(prof)
    setSync('local')
    navigator.storage?.persist?.()
  }, [])

  const api = useMemo(
    () => ({
      add: (coll, item) => {
        const full = { id: uid(), ...item }
        commit((d) => ({ ...d, [coll]: [...d[coll], full] }))
        return full
      },
      update: (coll, id, patch) =>
        commit((d) => ({ ...d, [coll]: d[coll].map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      remove: (coll, id) => commit((d) => ({ ...d, [coll]: d[coll].filter((x) => x.id !== id) })),
      setSettings: (patch) => commit((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
      setPin: (record) => commit((d) => ({ ...d, pin: record })),
      replaceAll: (next) => commit((d) => ({ ...normalize(next), settings: { ...normalize(next).settings, lastBackupAt: d.settings.lastBackupAt }, pin: d.pin })),
      mergeIn: (inc) => commit((d) => mergeData(d, normalize(inc))),
    }),
    [commit],
  )

  const value = {
    session,
    isLocal,
    ready,
    data,
    locked,
    unlock: () => setLocked(false),
    lock: () => data.pin && setLocked(true),
    sync,
    syncNow: pull,
    reconnect,
    login,
    loginLocal,
    loggingIn,
    error,
    logout,
    switchToGoogle,
    disconnectGoogle,
    ...api,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { normalize }
