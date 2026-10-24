import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { idbDel, idbGet, idbSet } from './idb'
import { applyOps } from './groupState'
import * as api from './api'

const POLL_MS = 6000

export const cacheKey = (id) => `group:${id}`
export const outboxKey = (id) => `outbox:${id}`
export const forgetGroupCache = (id) => Promise.all([idbDel(cacheKey(id)), idbDel(outboxKey(id))])

/**
 * Live view of a shared group.
 *  - keeps a cached copy (works offline) and polls the server while the app is visible
 *  - edits are applied instantly and queued in an outbox until they reach the server
 *  - the shown state = last server state + still-unsent edits
 */
export function useGroup(id) {
  const [server, setServer] = useState(null)
  const [outbox, setOutbox] = useState([])
  const [status, setStatus] = useState('loading') // loading | live | offline | missing
  const serverRef = useRef(null)
  const outboxRef = useRef([])
  const busy = useRef(false)

  const sync = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    let failed = false
    try {
      if (outboxRef.current.length) {
        const sent = outboxRef.current.slice()
        const r = await api.postOps(id, sent)
        outboxRef.current = outboxRef.current.filter((o) => !sent.includes(o))
        setOutbox(outboxRef.current)
        idbSet(outboxKey(id), outboxRef.current)
        serverRef.current = r.state
        setServer(r.state)
        idbSet(cacheKey(id), r.state)
      } else {
        const r = await api.getGroup(id, serverRef.current?.version)
        if (r.state) {
          serverRef.current = r.state
          setServer(r.state)
          idbSet(cacheKey(id), r.state)
        }
      }
      setStatus('live')
    } catch (e) {
      failed = true
      setStatus(e.code === 'not_found' ? 'missing' : 'offline')
    } finally {
      busy.current = false
      if (!failed && outboxRef.current.length) sync() // edits made while we were sending
    }
  }, [id])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [s, o] = await Promise.all([idbGet(cacheKey(id)), idbGet(outboxKey(id))])
      if (!alive) return
      serverRef.current = s || null
      outboxRef.current = o || []
      setServer(s || null)
      setOutbox(o || [])
      sync()
    })()
    const tick = () => document.visibilityState === 'visible' && sync()
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('online', tick)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('online', tick)
    }
  }, [id, sync])

  const dispatch = useCallback(
    (ops) => {
      const now = Date.now()
      const stamped = ops.map((o) => (o.t === 'set' ? { ...o, v: { ...o.v, u: now } } : { ...o, u: now }))
      outboxRef.current = [...outboxRef.current, ...stamped]
      setOutbox(outboxRef.current)
      idbSet(outboxKey(id), outboxRef.current)
      sync()
    },
    [id, sync],
  )

  const group = useMemo(() => (server ? applyOps(server, outbox, Date.now()).state : null), [server, outbox])
  return { group, status, dispatch, refresh: sync, pending: outbox.length }
}

export { groupMoney } from './groupState'
