import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { idbDel, idbGet, idbSet } from './idb'
import { applyOps } from './groupState'
import * as google from './google'

export const cacheKey = (id) => `group:${id}`
export const outboxKey = (id) => `outbox:${id}`
export const forgetGroupCache = (id) => Promise.all([idbDel(cacheKey(id)), idbDel(outboxKey(id))])

const ADMIN_POLL_MS = 20000 // the admin's other devices
const VIEWER_POLL_MS = 30000

/**
 * Live view of a shared group, which is a file in the admin's Google Drive.
 *  - role 'admin':  signed-in owner. Reads and writes the file; edits are queued in an outbox until saved.
 *  - role 'viewer': anyone with the link. Read-only, no sign-in (uses the public link + API key).
 * A cached copy keeps the group readable offline.
 */
export function useGroup(id, role = 'viewer', hint) {
  const admin = role === 'admin'
  const [server, setServer] = useState(null)
  const [outbox, setOutbox] = useState([])
  const [status, setStatus] = useState('loading') // loading | live | offline | auth | missing | nokey
  const serverRef = useRef(null)
  const outboxRef = useRef([])
  const busy = useRef(false)

  const accept = (state) => {
    serverRef.current = state
    setServer(state)
    idbSet(cacheKey(id), state)
  }

  const sync = useCallback(async () => {
    if (busy.current) return
    if (admin && !google.hasGroupScope()) { setStatus('scope'); return } // this device hasn't been given the Drive permission yet
    busy.current = true
    let failed = false
    try {
      if (admin && outboxRef.current.length) {
        const sent = outboxRef.current.slice()
        // start from what is in Drive now (the admin may use several devices), then apply our edits on top
        const base = (await google.readGroupFile(id, hint).catch((e) => { if (e.status === 404) throw e; return null })) || serverRef.current
        const next = applyOps(base, sent, Date.now()).state
        await google.writeGroupFile(id, next, hint)
        outboxRef.current = outboxRef.current.filter((o) => !sent.includes(o))
        setOutbox(outboxRef.current)
        idbSet(outboxKey(id), outboxRef.current)
        accept(next)
      } else {
        const st = admin ? await google.readGroupFile(id, hint) : await google.readPublicGroupFile(id)
        if (!serverRef.current || st.version !== serverRef.current.version || st.updatedAt !== serverRef.current.updatedAt) accept(st)
      }
      setStatus('live')
    } catch (e) {
      failed = true
      const code = e.code || (e.status === 404 ? 'not_found' : '')
      setStatus(code === 'not_found' || e.status === 404 ? 'missing' : code === 'no_key' ? 'nokey' : code === 'bad_key' ? 'badkey' : e.status === 401 || e.status === 403 || /popup|auth|access_denied|interaction|login/i.test(e.message || '') ? 'auth' : 'offline')
    } finally {
      busy.current = false
      if (!failed && admin && outboxRef.current.length) sync() // edits made while we were saving
    }
  }, [id, admin, hint])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [s, o] = await Promise.all([idbGet(cacheKey(id)), idbGet(outboxKey(id))])
      if (!alive) return
      serverRef.current = s || null
      outboxRef.current = admin ? o || [] : []
      setServer(s || null)
      setOutbox(outboxRef.current)
      sync()
    })()
    // background refreshes need a valid token (viewers need none); opening the group or tapping the status syncs anyway
    const tick = () => document.visibilityState === 'visible' && (!admin || google.hasLiveToken()) && sync()
    const timer = setInterval(tick, admin ? ADMIN_POLL_MS : VIEWER_POLL_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('online', tick)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('online', tick)
    }
  }, [id, admin, sync])

  /** Admin only: apply edits now, save to Drive in the background. */
  const dispatch = useCallback(
    (ops) => {
      if (!admin) return
      const now = Date.now()
      const stamped = ops.map((o) => (o.t === 'set' ? { ...o, v: { ...o.v, u: now } } : { ...o, u: now }))
      outboxRef.current = [...outboxRef.current, ...stamped]
      setOutbox(outboxRef.current)
      idbSet(outboxKey(id), outboxRef.current)
      sync()
    },
    [id, admin, sync],
  )

  const group = useMemo(() => (server ? applyOps(server, outbox, Date.now()).state : null), [server, outbox])
  return { group, status, dispatch, refresh: sync, pending: outbox.length }
}

