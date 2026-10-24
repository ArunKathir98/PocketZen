import { useEffect, useState } from 'react'
import { Eye, Plus, UserPlus } from 'lucide-react'
import { useApp } from '../lib/store'
import { CURRENCIES } from '../lib/defaults'
import { uid } from '../lib/util'
import { idbGet, idbSet } from '../lib/idb'
import { cacheKey } from '../lib/useGroup'
import { applyOps, emptyGroup, groupMoney, groupTotal, isGroupId, live, members as listMembers, parseGroupRef } from '../lib/groupState'
import { clearPendingJoin, getPendingJoin } from '../lib/pendingJoin'
import * as google from '../lib/google'
import { Empty, Modal } from '../components/ui'
import GroupView from './GroupView'

const colors = ['#14b8a6', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#22c55e', '#3b82f6']
const colorOf = (s) => colors[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length]

export const friendlyGroupError = (e) =>
  /popup_closed|access_denied/.test(e?.message || '') ? 'The Google permission request was cancelled.'
    : e?.code === 'no_key' ? 'Viewing group links needs the app\'s Google API key (VITE_GOOGLE_API_KEY). See the README.'
    : e?.code === 'bad_key' ? "Google rejected the app's API key for this website. Check the key's website restrictions and that the Drive API is enabled (see the README)."
    : e?.code === 'offline' || !navigator.onLine ? 'You seem to be offline.'
    : e?.code === 'not_found' || e?.status === 404 ? 'No group found. The link may be wrong, or the admin turned sharing off or deleted it.'
    : e?.status === 403 ? 'Google did not allow that. Make sure you granted the Drive permission when asked.'
    : 'Something went wrong. Please try again in a moment.'

function GroupCard({ entry, onOpen }) {
  const [state, setState] = useState(null)
  useEffect(() => { idbGet(cacheKey(entry.id)).then(setState) }, [entry.id])
  const money = groupMoney(state?.currency)
  return (
    <button className="item" onClick={onOpen}>
      <span className="ico" style={{ background: `${colorOf(entry.name)}26`, color: colorOf(entry.name), fontWeight: 800 }}>{entry.name[0]?.toUpperCase()}</span>
      <span className="main">
        <div className="t">{entry.name}</div>
        <div className="s">{entry.role === 'admin' ? 'You manage this group' : 'View only'}{state ? ` · ${listMembers(state).length} people · ${live(state, 'expenses').length} expenses` : ''}</div>
      </span>
      {entry.role !== 'admin' && <Eye size={15} color="var(--muted)" />}
      {state && <span className="amt num">{money(groupTotal(state))}</span>}
    </button>
  )
}

export default function Groups() {
  const { data, remove } = useApp()
  const [openId, setOpenId] = useState(null)
  const [create, setCreate] = useState(false)
  const [join, setJoin] = useState(() => (getPendingJoin() ? parseGroupRef(getPendingJoin()) : null)) // null = closed, '' = manual entry

  // groups saved by the earlier server-based version no longer exist: clean them out
  useEffect(() => { data.groups.filter((g) => !g.role).forEach((g) => remove('groups', g.id)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = data.groups.filter((g) => g.role)
  const open = groups.find((g) => g.id === openId)
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
      {groups.length === 0 ? (
        <Empty emoji="🧾" title="No groups yet" text="Create a group for a trip, flat or event and add the expenses. Friends open your link to see who owes what. They can view, and you stay in control."
          action={<div className="row" style={{ justifyContent: 'center', gap: 8 }}><button className="btn primary" onClick={() => setCreate(true)}>Create a group</button><button className="btn ghost" onClick={() => setJoin('')}>Join with a link</button></div>} />
      ) : (
        <div className="card list">{groups.map((g) => <GroupCard key={g.id} entry={g} onOpen={() => setOpenId(g.id)} />)}</div>
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
      await google.enableGroupScope(session.email) // first thing in the click: may open Google's permission popup
      const memberId = uid()
      const draft = applyOps(emptyGroup('pending', name.trim(), currency, Date.now()), [{ t: 'set', c: 'members', id: memberId, v: { name: me.trim(), email: session.email || '', u: Date.now() } }]).state
      const id = await google.createGroupFile(draft.name, draft, session.email)
      const state = { ...draft, id }
      await google.writeGroupFile(id, state, session.email) // store the real id inside the file
      await idbSet(cacheKey(id), state)
      add('groups', { id, name: state.name, role: 'admin', me: memberId, joinedAt: Date.now() })
      onCreated(id)
    } catch (e) {
      setErr(friendlyGroupError(e))
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
        <p className="muted" style={{ fontSize: 12.5 }}>
          The group is saved as a file in <b>your</b> Google Drive. Anyone you send the link to can <b>view</b> it; only you can make changes. Google will ask once for permission to create that file.
        </p>
      </div>
    </Modal>
  )
}

function JoinGroup({ initial, onClose, onJoined }) {
  const { data, add } = useApp()
  const [text, setText] = useState(initial || '')
  const [found, setFound] = useState(null)
  const [pick, setPick] = useState('') // my member id, or '' = just viewing
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const find = async (value = text) => {
    setErr('')
    const id = parseGroupRef(value)
    if (!isGroupId(id)) return setErr("That doesn't look like a group link or ID.")
    if (data.groups.some((g) => g.id === id && g.role)) return onJoined(id)
    setBusy(true)
    try {
      const state = await google.readPublicGroupFile(id)
      setFound({ ...state, id })
    } catch (e) {
      setErr(friendlyGroupError(e))
    } finally {
      setBusy(false)
    }
  }
  // opened from an invite link: look the group up straight away
  useEffect(() => { if (initial) find(initial) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    await idbSet(cacheKey(found.id), found)
    add('groups', { id: found.id, name: found.name, role: 'viewer', me: pick, joinedAt: Date.now() })
    onJoined(found.id)
  }

  return (
    <Modal title="Join a group" onClose={onClose}
      footer={
        <div className="stack" style={{ gap: 8 }}>
          {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
          {!found
            ? <button className="btn primary block" disabled={!text.trim() || busy} onClick={() => find()}>{busy ? 'Looking…' : 'Find group'}</button>
            : <button className="btn primary block" onClick={join}>Save {found.name}</button>}
        </div>
      }>
      <div className="stack">
        {!found ? (
          <div className="field"><label htmlFor="jid">Group link or ID</label>
            <input id="jid" className="input" autoFocus placeholder="Paste the link you were sent" value={text} autoComplete="off" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} /></div>
        ) : (
          <>
            <div className="note-box">Group: <b>{found.name}</b> · {listMembers(found).length} people · view only</div>
            <div className="field"><label>Which one are you? (optional, to show your balance)</label>
              <div className="chips">
                <button type="button" className={`chip ${pick === '' ? 'on' : ''}`} onClick={() => setPick('')}>Just viewing</button>
                {listMembers(found).map((m) => <button key={m.id} type="button" className={`chip ${pick === m.id ? 'on' : ''}`} onClick={() => setPick(m.id)}>{m.name}</button>)}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
