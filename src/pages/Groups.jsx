import { useEffect, useState } from 'react'
import { Plus, UserPlus } from 'lucide-react'
import { useApp } from '../lib/store'
import { CURRENCIES } from '../lib/defaults'
import { uid } from '../lib/util'
import { idbGet, idbSet } from '../lib/idb'
import { cacheKey } from '../lib/useGroup'
import { formatGroupId, groupMoney, groupTotal, isGroupId, live, normalizeGroupId, members as listMembers } from '../lib/groupState'
import { clearPendingJoin, getPendingJoin } from '../lib/pendingJoin'
import * as api from '../lib/api'
import { Empty, Modal } from '../components/ui'
import GroupView from './GroupView'

const colors = ['#14b8a6', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#22c55e', '#3b82f6']
const colorOf = (s) => colors[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length]

const friendlyError = (e) =>
  e.code === 'offline' ? 'You seem to be offline. Groups need an internet connection.'
    : e.code === 'not_found' ? 'No group found with that ID. Check it and try again.'
    : e.code === 'bad_id' ? "That doesn't look like a group ID (12 letters and numbers)."
    : 'Groups could not be reached right now. Please try again in a moment.'

/** Accepts a bare ID, a dashed ID or a full invite link. */
export const parseGroupInput = (text) => {
  const m = String(text || '').match(/[?&]join=([A-Za-z0-9-]+)/)
  return normalizeGroupId(m ? m[1] : text)
}

function GroupCard({ entry, onOpen }) {
  const [state, setState] = useState(null)
  useEffect(() => { idbGet(cacheKey(entry.id)).then(setState) }, [entry.id])
  const money = groupMoney(state?.currency)
  return (
    <button className="item" onClick={onOpen}>
      <span className="ico" style={{ background: `${colorOf(entry.name)}26`, color: colorOf(entry.name), fontWeight: 800 }}>{entry.name[0]?.toUpperCase()}</span>
      <span className="main">
        <div className="t">{entry.name}</div>
        <div className="s">{state ? `${listMembers(state).length} people · ${live(state, 'expenses').length} expenses` : 'Tap to open'} · {formatGroupId(entry.id)}</div>
      </span>
      {state && <span className="amt num">{money(groupTotal(state))}</span>}
    </button>
  )
}

export default function Groups() {
  const { data } = useApp()
  const [openId, setOpenId] = useState(null)
  const [create, setCreate] = useState(false)
  const [join, setJoin] = useState(() => (getPendingJoin() ? parseGroupInput(getPendingJoin()) : null)) // null = closed, '' = manual entry

  const open = data.groups.find((g) => g.id === openId)
  if (open) return <GroupView entry={open} onBack={() => setOpenId(null)} />

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Groups</h1><p>Split expenses with friends</p></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={() => setJoin('')}><UserPlus size={17} /> Join</button>
          <button className="btn primary" onClick={() => setCreate(true)}><Plus size={18} /> New</button>
        </div>
      </div>
      {data.groups.length === 0 ? (
        <Empty emoji="🧾" title="No groups yet" text="Create a group for a trip, flat or event, then invite friends with its ID. Everyone can add expenses, and PocketZen works out who pays whom."
          action={<div className="row" style={{ justifyContent: 'center', gap: 8 }}><button className="btn primary" onClick={() => setCreate(true)}>Create a group</button><button className="btn ghost" onClick={() => setJoin('')}>Join with an ID</button></div>} />
      ) : (
        <div className="card list">{data.groups.map((g) => <GroupCard key={g.id} entry={g} onOpen={() => setOpenId(g.id)} />)}</div>
      )}
      {create && <CreateGroup onClose={() => setCreate(false)} onCreated={(id) => { setCreate(false); setOpenId(id) }} />}
      {join !== null && <JoinGroup initial={join} onClose={() => { setJoin(null); clearPendingJoin() }} onJoined={(id) => { setJoin(null); clearPendingJoin(); setOpenId(id) }} />}
    </div>
  )
}

function CreateGroup({ onClose, onCreated }) {
  const { data, session, add } = useApp()
  const [name, setName] = useState('')
  const [me, setMe] = useState(session?.mode === 'google' ? session.name || '' : '')
  const [currency, setCurrency] = useState(data.settings.currency)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setErr('')
    setBusy(true)
    try {
      const { state } = await api.createGroup(name.trim(), currency)
      const memberId = uid()
      const r = await api.postOps(state.id, [{ t: 'set', c: 'members', id: memberId, v: { name: me.trim(), email: session?.email || '', u: Date.now() } }])
      await idbSet(cacheKey(state.id), r.state)
      add('groups', { id: state.id, name: state.name, me: memberId, joinedAt: Date.now() })
      onCreated(state.id)
    } catch (e) {
      setErr(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="New group" onClose={onClose}
      footer={<div className="stack" style={{ gap: 8 }}>{err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}<button className="btn primary block" disabled={!name.trim() || !me.trim() || busy} onClick={save}>{busy ? 'Creating…' : 'Create group'}</button></div>}>
      <div className="stack">
        <div className="field"><label htmlFor="gn">Group name</label><input id="gn" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goa trip, Flat 4B" /></div>
        <div className="field"><label htmlFor="gm">Your name in this group</label><input id="gm" className="input" value={me} onChange={(e) => setMe(e.target.value)} placeholder="e.g. Arun" /></div>
        <div className="field"><label htmlFor="gc">Currency</label>
          <select id="gc" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <p className="muted" style={{ fontSize: 12.5 }}>You'll get a group ID to share. Anyone with it can view and add expenses, with the same rights as you.</p>
      </div>
    </Modal>
  )
}

function JoinGroup({ initial, onClose, onJoined }) {
  const { data, session, add } = useApp()
  const [text, setText] = useState(initial ? formatGroupId(initial) : '')
  const [found, setFound] = useState(null)
  const [pick, setPick] = useState('') // member id, or 'new'
  const [name, setName] = useState(session?.mode === 'google' ? session.name || '' : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const find = async (value = text) => {
    setErr('')
    const id = parseGroupInput(value)
    if (!isGroupId(id)) return setErr("That doesn't look like a group ID (12 letters and numbers).")
    const existing = data.groups.find((g) => g.id === id)
    if (existing) return onJoined(id)
    setBusy(true)
    try {
      const { state } = await api.getGroup(id)
      setFound(state)
      setPick(listMembers(state).length ? '' : 'new')
    } catch (e) {
      setErr(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  // opened from an invite link: look the group up straight away
  useEffect(() => { if (initial) find(initial) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    setErr('')
    setBusy(true)
    try {
      let state = found
      let me = pick
      if (pick === 'new') {
        me = uid()
        const r = await api.postOps(found.id, [{ t: 'set', c: 'members', id: me, v: { name: name.trim(), email: session?.email || '', u: Date.now() } }])
        state = r.state
      }
      await idbSet(cacheKey(state.id), state)
      add('groups', { id: state.id, name: state.name, me, joinedAt: Date.now() })
      onJoined(state.id)
    } catch (e) {
      setErr(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="Join a group" onClose={onClose}
      footer={
        <div className="stack" style={{ gap: 8 }}>
          {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
          {!found
            ? <button className="btn primary block" disabled={!text.trim() || busy} onClick={() => find()}>{busy ? 'Looking…' : 'Find group'}</button>
            : <button className="btn primary block" disabled={busy || !pick || (pick === 'new' && !name.trim())} onClick={join}>{busy ? 'Joining…' : `Join ${found.name}`}</button>}
        </div>
      }>
      <div className="stack">
        {!found ? (
          <div className="field"><label htmlFor="jid">Group ID or invite link</label>
            <input id="jid" className="input num" autoFocus placeholder="XXXX-XXXX-XXXX" value={text} autoCapitalize="characters" autoComplete="off" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} /></div>
        ) : (
          <>
            <div className="note-box">Group: <b>{found.name}</b> · {listMembers(found).length} people</div>
            <div className="field"><label>Which one are you?</label>
              <div className="chips">
                {listMembers(found).map((m) => <button key={m.id} type="button" className={`chip ${pick === m.id ? 'on' : ''}`} onClick={() => setPick(m.id)}>{m.name}</button>)}
                <button type="button" className={`chip ${pick === 'new' ? 'on' : ''}`} onClick={() => setPick('new')}>I'm not listed</button>
              </div>
            </div>
            {pick === 'new' && <div className="field"><label htmlFor="jn">Your name</label><input id="jn" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>}
          </>
        )}
      </div>
    </Modal>
  )
}
