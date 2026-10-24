import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { emptyData } from './defaults'
import { setCurrency, uid } from './util'
import * as google from './google'

const SESSION_KEY = 'pz:session'
const dataKey = (sub) => `pz:data:${sub}`
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
  for (const k of ['accounts', 'categories', 'transactions', 'budgets', 'reminders']) if (!Array.isArray(out[k])) out[k] = base[k]
  return out
}

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  // The session never expires on its own: it is only removed by an explicit logout.
  const [session, setSession] = useState(() => readJson(SESSION_KEY))
  const [data, setData] = useState(() => {
    const s = readJson(SESSION_KEY)
    return s ? normalize(readJson(dataKey(s.sub))) : emptyData()
  })
  const [locked, setLocked] = useState(() => !!data.pin)
  const [sync, setSync] = useState('idle') // idle | syncing | synced | offline | auth | error
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState('')

  const dataRef = useRef(data)
  const sessionRef = useRef(session)
  const pushTimer = useRef(null)
  const pushing = useRef(false)
  dataRef.current = data
  sessionRef.current = session

  useEffect(() => setCurrency(data.settings.currency), [data.settings.currency])

  const persistLocal = useCallback((sub, d) => {
    try {
      localStorage.setItem(dataKey(sub), JSON.stringify(d))
    } catch { /* storage full / blocked */ }
  }, [])

  const classify = (e) => (!navigator.onLine || e instanceof TypeError ? 'offline' : /popup|auth|access_denied|immediate|interaction|login/i.test(e.message) || e.status === 401 || e.status === 403 ? 'auth' : 'error')

  const push = useCallback(async () => {
    const s = sessionRef.current
    if (!s || pushing.current) return
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
    if (!s) return
    setSync('syncing')
    try {
      const remote = await google.driveLoad(s.sub, s.email)
      const local = dataRef.current
      const dirty = !!localStorage.getItem(dirtyKey(s.sub))
      if (remote && (remote.updatedAt || 0) > (local.updatedAt || 0) && !dirty) {
        const next = normalize(remote)
        persistLocal(s.sub, next)
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
    if (session) pull()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sub])

  // Retry when the network or the tab comes back; auto-lock after being away.
  useEffect(() => {
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else {
        if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS && dataRef.current.pin) setLocked(true)
        hiddenAt = 0
        if (sessionRef.current && localStorage.getItem(dirtyKey(sessionRef.current.sub))) schedulePush(300)
      }
    }
    const onOnline = () => sessionRef.current && pull()
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
        localStorage.setItem(dirtyKey(s.sub), '1')
        schedulePush()
      }
    },
    [persistLocal, schedulePush],
  )

  const login = useCallback(async () => {
    setError('')
    setLoggingIn(true)
    try {
      await google.requestToken({ prompt: 'select_account' })
      const profile = await google.fetchProfile()
      const prof = { ...profile, since: Date.now() }
      localStorage.setItem(SESSION_KEY, JSON.stringify(prof))
      sessionRef.current = prof
      dataRef.current = normalize(readJson(dataKey(prof.sub)))
      setData(dataRef.current)
      setLocked(false)
      setSession(prof)
    } catch (e) {
      setError(
        /popup_closed|access_denied/.test(e.message)
          ? 'Sign-in was cancelled.'
          : e.message || 'Could not sign in with Google.',
      )
    } finally {
      setLoggingIn(false)
    }
  }, [])

  /** Needs a user gesture – used by the "Reconnect" banner when silent refresh is blocked. */
  const reconnect = useCallback(async () => {
    const s = sessionRef.current
    if (!s) return
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

  const logout = useCallback(async () => {
    const s = sessionRef.current
    if (s && localStorage.getItem(dirtyKey(s.sub))) {
      try { await google.driveSave(s.sub, dataRef.current, s.email) } catch { /* best effort */ }
    }
    google.signOutGoogle()
    if (s) {
      localStorage.removeItem(dataKey(s.sub))
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
      replaceAll: (next) => commit((d) => ({ ...normalize(next), pin: d.pin })),
      mergeIn: (inc) =>
        commit((d) => {
          const n = normalize(inc)
          const mergeBy = (a, b) => {
            const ids = new Set(a.map((x) => x.id))
            return [...a, ...b.filter((x) => !ids.has(x.id))]
          }
          return {
            ...d,
            accounts: mergeBy(d.accounts, n.accounts),
            categories: mergeBy(d.categories, n.categories),
            transactions: mergeBy(d.transactions, n.transactions),
            budgets: mergeBy(d.budgets, n.budgets),
            reminders: mergeBy(d.reminders, n.reminders),
          }
        }),
    }),
    [commit],
  )

  const value = {
    session,
    data,
    locked,
    unlock: () => setLocked(false),
    lock: () => data.pin && setLocked(true),
    sync,
    syncNow: pull,
    reconnect,
    login,
    loggingIn,
    error,
    logout,
    ...api,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
