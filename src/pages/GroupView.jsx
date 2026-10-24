import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Copy, Eye, FileDown, HandCoins, MessageCircle, Pencil, Plus, Receipt, Scale, Share2, Trash2, UserPlus, Wifi, WifiOff } from 'lucide-react'
import { useApp } from '../lib/store'
import { useGroup, forgetGroupCache } from '../lib/useGroup'
import { computeBalances, formatGroupId, groupMoney, groupTotal, live, memberName, members as listMembers, splitEqual, suggestSettlements, toMinor } from '../lib/groupState'
import { buildGroupPdf, shareOrDownloadPdf } from '../lib/groupPdf'
import { currencySymbol, todayStr, uid } from '../lib/util'
import * as google from '../lib/google'
import { useDialog } from '../components/dialog'
import { Modal } from '../components/ui'

const dmy = (s) => new Date(s + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const num = (set) => (e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && set(e.target.value)
const set = (c, id, v) => ({ t: 'set', c, id, v })

export default function GroupView({ entry, onBack, publicMode = false }) {
  const { update, remove, session } = useApp()
  const admin = entry.role === 'admin'
  const { confirm, alert } = useDialog()
  const { group, status, dispatch, refresh, pending } = useGroup(entry.id, entry.role, session?.email)
  const [form, setForm] = useState(null) // { kind, item? }
  const [sheet, setSheet] = useState(null) // 'settle' | 'summary' | 'invite'
  const [eventFilter, setEventFilter] = useState('')

  // keep the name shown in my list in sync with the group
  useEffect(() => { if (!publicMode && group && group.name !== entry.name) update('groups', entry.id, { name: group.name }) }, [group?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const money = useMemo(() => groupMoney(group?.currency), [group?.currency])
  const people = useMemo(() => (group ? listMembers(group) : []), [group])
  const balances = useMemo(() => (group ? computeBalances(group) : []), [group])
  const plan = useMemo(() => suggestSettlements(balances), [balances])
  const events = useMemo(() => (group ? live(group, 'events').sort((a, b) => a.name.localeCompare(b.name)) : []), [group])
  const expenses = useMemo(() => (group ? live(group, 'expenses').filter((e) => !eventFilter || e.eventId === eventFilter).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.u - a.u)) : []), [group, eventFilter])
  const payments = useMemo(() => (group ? live(group, 'payments').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.u - a.u)) : []), [group])

  const leave = async () => {
    if (!(await confirm({ title: 'Remove this group?', message: `It is removed from your list only. You can add it again from the link.`, confirmText: 'Remove', danger: true }))) return
    await forgetGroupCache(entry.id)
    onBack()
    remove('groups', entry.id)
  }
  const destroy = async () => {
    if (!(await confirm({ title: 'Delete this group?', message: `This deletes "${entry.name}" and all its expenses from your Drive. Everyone with the link loses access. This cannot be undone.`, confirmText: 'Delete group', danger: true }))) return
    try {
      await google.deleteGroupFile(entry.id, session?.email)
    } catch (e) {
      if (e.status !== 404) return alert({ title: "Couldn't delete", message: !navigator.onLine ? 'You are offline. Try again when connected.' : 'Please try again in a moment.' })
    }
    await forgetGroupCache(entry.id)
    onBack()
    remove('groups', entry.id)
  }
  const rename = async () => setForm({ kind: 'rename' })

  if (status === 'missing') {
    return (
      <div className="page">
        <button className="btn ghost sm" onClick={onBack}><ArrowLeft size={16} /> Groups</button>
        <div className="empty card" style={{ marginTop: 14 }}>
          <div className="em">🗑️</div><h3>This group isn't available</h3><p>The admin may have deleted it or turned off sharing.</p>
          <div style={{ marginTop: 16 }}><button className="btn primary" onClick={async () => { await forgetGroupCache(entry.id); onBack(); remove('groups', entry.id) }}>Remove from my list</button></div>
        </div>
      </div>
    )
  }
  if (!group) {
    return (
      <div className="page">
        <button className="btn ghost sm" onClick={onBack}><ArrowLeft size={16} /> Groups</button>
        {admin && status === 'scope' ? (
          <div className="banner" role="alert" style={{ marginTop: 14 }}><span>Allow PocketZen to open this group's file in your Google Drive.</span>
            <button className="btn sm primary" onClick={async () => { try { await google.enableGroupScope(session?.email); refresh() } catch { /* cancelled */ } }}>Allow</button></div>
        ) : status === 'nokey' || status === 'badkey' ? (
          <div className="banner" role="alert" style={{ marginTop: 14 }}><span>{status === 'nokey' ? "Viewing links needs the app's Google API key (VITE_GOOGLE_API_KEY). See the README." : "Google rejected the app's API key for this website. Check the key's website restrictions and that the Drive API is enabled (see the README)."}</span></div>
        ) : (
          <p className="muted" style={{ marginTop: 18 }}>
            {status === 'offline' ? "Can't reach the group — check your connection." : status === 'auth' ? 'Google needs to reconnect.' : 'Loading…'}
            {(status === 'offline' || status === 'auth') && <> <button className="btn sm ghost" onClick={refresh}>Try again</button></>}
          </p>
        )}
      </div>
    )
  }

  const Tag = admin ? 'button' : 'div'
  const me = entry.me
  const mine = balances.find((b) => b.id === me)
  const myNet = mine?.net || 0
  const total = groupTotal(group)

  return (
    <div className="page">
      <div className="page-head">
        <div className="row" style={{ minWidth: 0 }}>
          <button className="icon-btn" aria-label="Back to groups" onClick={onBack}><ArrowLeft size={18} /></button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</h1>
            <p>{people.length} {people.length === 1 ? 'person' : 'people'} · {admin ? 'you manage this group' : 'view only'}</p>
          </div>
        </div>
        <button className="sync" onClick={refresh} title="Refresh" aria-label="Refresh group">
          {status === 'live' && !pending ? <Wifi size={13} /> : <WifiOff size={13} />}
          {pending ? `${pending} to save` : status === 'live' ? 'Live' : status === 'auth' || status === 'scope' ? 'Reconnect' : 'Offline'}
        </button>
      </div>

      <div className="stack">
        {!admin && <div className="banner install" role="status" style={{ marginBottom: 0 }}><Eye size={16} style={{ flex: 'none' }} /> <span>View only. Only the group admin can make changes.</span></div>}
        {admin && status === 'scope' && (
          <div className="banner" role="alert" style={{ marginBottom: 0 }}><span>Allow PocketZen to open this group's file in your Google Drive.</span>
            <button className="btn sm primary" onClick={async () => { try { await google.enableGroupScope(session?.email); refresh() } catch { /* cancelled */ } }}>Allow</button></div>
        )}
        {admin && status === 'auth' && <div className="banner" role="alert" style={{ marginBottom: 0 }}><span>Google needs to reconnect. Tap “Reconnect” above.</span></div>}
        {status === 'nokey' && <div className="banner" role="alert" style={{ marginBottom: 0 }}><span>Viewing links needs the app's Google API key (VITE_GOOGLE_API_KEY). See the README.</span></div>}
        {status === 'badkey' && <div className="banner" role="alert" style={{ marginBottom: 0 }}><span>Google rejected the app's API key for this website. Check the key's website restrictions and that the Drive API is enabled (see the README).</span></div>}
        <div className="hero">
          <div className="label">Total spent</div>
          <div className="big num">{money(total)}</div>
          <div className="pair">
            <div><span className="l">{myNet > 0 ? 'You are owed' : myNet < 0 ? 'You owe' : 'You'}</span><b className="num">{myNet === 0 ? 'Settled' : money(Math.abs(myNet))}</b></div>
            <div><span className="l">Expenses</span><b className="num">{live(group, 'expenses').length}</b></div>
          </div>
        </div>

        {admin && <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => setForm({ kind: 'expense' })}><Receipt size={16} /> Expense</button>
          <button className="btn ghost" onClick={() => setForm({ kind: 'payment' })}><HandCoins size={16} /> Payment</button>
          <button className="btn ghost" onClick={() => setForm({ kind: 'person' })}><UserPlus size={16} /> Person</button>
          <button className="btn ghost" onClick={() => setForm({ kind: 'event' })}><Plus size={16} /> Event</button>
        </div>}
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={() => setSheet('settle')}><Scale size={16} /> {admin ? 'Settle up' : 'Who pays'}{plan.length ? ` (${plan.length})` : ''}</button>
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => setSheet('summary')}><FileDown size={16} /> Summary</button>
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => setSheet('invite')}><Share2 size={16} /> Invite</button>
        </div>

        <div className="section-title" style={{ margin: '6px 4px 0' }}>Expenses</div>
        {events.length > 0 && (
          <div className="chips">
            <button className={`chip ${eventFilter === '' ? 'on' : ''}`} onClick={() => setEventFilter('')}>All events</button>
            {events.map((ev) => <button key={ev.id} className={`chip ${eventFilter === ev.id ? 'on' : ''}`} onClick={() => setEventFilter(ev.id)}>{ev.name}</button>)}
          </div>
        )}
        {expenses.length === 0 ? <p className="muted" style={{ padding: '6px 4px' }}>{admin ? <>No expenses yet. Tap <b>Expense</b> to add the first one.</> : 'No expenses yet.'}</p> : (
          <div className="card list">
            {expenses.map((e) => {
              const share = splitEqual(toMinor(e.amount), e.split)[me]
              const ev = e.eventId && group.events[e.eventId] && !group.events[e.eventId].deleted ? group.events[e.eventId].name : ''
              return (
                <Tag className="item" key={e.id} onClick={admin ? () => setForm({ kind: 'expense', item: e }) : undefined}>
                  <span className="main">
                    <div className="t">{e.title}</div>
                    <div className="s">{memberName(group, e.paidBy)} paid · {dmy(e.date)}{ev ? ` · ${ev}` : ''} · {e.split.length === people.length ? 'everyone' : `${e.split.length} people`}</div>
                  </span>
                  <span className="amt num" style={{ textAlign: 'right' }}>
                    {money(toMinor(e.amount))}
                    {share != null && <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>your share {money(share)}</div>}
                  </span>
                </Tag>
              )
            })}
          </div>
        )}

        {payments.length > 0 && (
          <>
            <div className="section-title" style={{ margin: '10px 4px 0' }}>Payments</div>
            <div className="card list">
              {payments.map((p) => (
                <Tag className="item" key={p.id} onClick={admin ? () => setForm({ kind: 'payment', item: p }) : undefined}>
                  <span className="main"><div className="t">{memberName(group, p.from)} → {memberName(group, p.to)}</div><div className="s">{dmy(p.date)}{p.settle ? ' · settle up' : ''}{p.note ? ` · ${p.note}` : ''}</div></span>
                  <span className="amt num inc">{money(toMinor(p.amount))}</span>
                </Tag>
              ))}
            </div>
          </>
        )}

        <div className="section-title" style={{ margin: '10px 4px 0' }}>People</div>
        <div className="card list">
          {balances.map((b) => {
            const m = group.members[b.id]
            return (
              <Tag className="item" key={b.id} onClick={admin && m ? () => setForm({ kind: 'person', item: m }) : undefined}>
                <span className="main"><div className="t">{b.name}{b.id === me ? ' (you)' : ''}</div><div className="s">Paid {money(b.paid)} · share {money(b.share)}{m?.email ? ` · ${m.email}` : ''}</div></span>
                <span className={`amt num ${b.net > 0 ? 'inc' : b.net < 0 ? 'exp' : ''}`} style={{ textAlign: 'right' }}>
                  {b.net === 0 ? 'Settled' : money(Math.abs(b.net))}
                  {b.net !== 0 && <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>{b.net > 0 ? 'gets' : 'owes'}</div>}
                </span>
              </Tag>
            )
          })}
        </div>

        {events.length > 0 && (
          <>
            <div className="section-title" style={{ margin: '10px 4px 0' }}>Events</div>
            <div className="chips">{events.map((ev) => admin ? <button key={ev.id} className="chip" onClick={() => setForm({ kind: 'event', item: ev })}><Pencil size={12} /> {ev.name}</button> : <span key={ev.id} className="chip">{ev.name}</span>)}</div>
          </>
        )}

        {!publicMode && (
          <>
            <div className="section-title" style={{ margin: '14px 4px 0' }}>Group</div>
            <div className="card list">
              {admin ? (
                <>
                  <button className="setting" onClick={rename}><span className="si"><Pencil size={18} /></span><span className="main"><div className="t">Rename group</div></span></button>
                  <button className="setting" onClick={destroy}><span className="si" style={{ color: 'var(--expense)' }}><Trash2 size={18} /></span><span className="main"><div className="t exp">Delete group</div><div className="s">Deletes the file from your Drive. Nobody can view it afterwards.</div></span></button>
                </>
              ) : (
                <button className="setting" onClick={leave}><span className="si"><ArrowLeft size={18} /></span><span className="main"><div className="t">Remove from my list</div><div className="s">The group itself is not affected.</div></span></button>
              )}
            </div>
          </>
        )}
      </div>

      {form?.kind === 'expense' && <ExpenseForm group={group} me={me} item={form.item} dispatch={dispatch} onClose={() => setForm(null)} />}
      {form?.kind === 'payment' && <PaymentForm group={group} me={me} item={form.item} dispatch={dispatch} onClose={() => setForm(null)} />}
      {form?.kind === 'person' && <PersonForm group={group} item={form.item} dispatch={dispatch} onClose={() => setForm(null)} />}
      {form?.kind === 'event' && <EventForm item={form.item} dispatch={dispatch} onClose={() => setForm(null)} />}
      {form?.kind === 'rename' && <RenameForm group={group} dispatch={dispatch} onClose={() => setForm(null)} />}
      {sheet === 'settle' && <SettleUp group={group} balances={balances} plan={plan} money={money} dispatch={dispatch} readOnly={!admin} onClose={() => setSheet(null)} />}
      {sheet === 'summary' && <Summary group={group} balances={balances} plan={plan} money={money} onClose={() => setSheet(null)} />}
      {sheet === 'invite' && <Invite group={group} onClose={() => setSheet(null)} />}
    </div>
  )
}

/* ───────────── forms ───────────── */

function Chips({ items, value, onChange, multi }) {
  return (
    <div className="chips">
      {items.map((m) => {
        const on = multi ? value.has(m.id) : value === m.id
        return <button key={m.id} type="button" className={`chip ${on ? 'on' : ''}`} onClick={() => onChange(m.id)}>{m.name}</button>
      })}
    </div>
  )
}

function ExpenseForm({ group, me, item, dispatch, onClose }) {
  const { confirm } = useDialog()
  const ms = listMembers(group)
  const events = live(group, 'events')
  const money = groupMoney(group.currency)
  const [title, setTitle] = useState(item?.title || '')
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [date, setDate] = useState(item?.date || todayStr())
  const [eventId, setEventId] = useState(item?.eventId || '')
  const [paidBy, setPaidBy] = useState(item?.paidBy || (ms.some((m) => m.id === me) ? me : ms[0]?.id) || '')
  const [split, setSplit] = useState(new Set(item?.split || ms.map((m) => m.id)))
  const [note, setNote] = useState(item?.note || '')
  const [err, setErr] = useState('')
  const v = parseFloat(amount) || 0
  const toggle = (id) => setSplit((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const save = () => {
    if (!(v > 0)) return setErr('Enter an amount greater than zero.')
    if (!paidBy) return setErr('Choose who paid.')
    if (!split.size) return setErr('Choose at least one person to split between.')
    dispatch([set('expenses', item?.id || uid(), { title: title.trim() || 'Expense', amount: v, paidBy, split: ms.map((m) => m.id).filter((id) => split.has(id)), eventId, date, note: note.trim() })])
    onClose()
  }
  const del = async () => {
    if (await confirm({ title: 'Delete this expense?', message: 'It is removed for everyone in the group.', confirmText: 'Delete', danger: true })) {
      dispatch([set('expenses', item.id, { ...item, deleted: true })])
      onClose()
    }
  }

  return (
    <Modal title={item ? 'Edit expense' : 'New expense'} onClose={onClose}
      footer={<div className="stack" style={{ gap: 8 }}>{err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}<div className="row">{item && <button className="btn danger" aria-label="Delete expense" onClick={del}><Trash2 size={18} /></button>}<button className="btn primary block" onClick={save}>Save</button></div></div>}>
      <div className="stack">
        <div className="field"><label htmlFor="xt">Name</label><input id="xt" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner, Taxi, Hotel" /></div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="xa">Amount ({currencySymbol()})</label><input id="xa" className="input num" inputMode="decimal" value={amount} placeholder="0" onChange={num(setAmount)} /></div>
          <div className="field"><label htmlFor="xd">Date</label><input id="xd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="field"><label>Who paid?</label><Chips items={ms} value={paidBy} onChange={setPaidBy} /></div>
        <div className="field">
          <label>Split between ({split.size} {split.size === 1 ? 'person' : 'people'})</label>
          <div className="chips">
            <button type="button" className={`chip ${split.size === ms.length ? 'on' : ''}`} onClick={() => setSplit(new Set(split.size === ms.length ? [] : ms.map((m) => m.id)))}>Everyone</button>
            {ms.map((m) => <button key={m.id} type="button" className={`chip ${split.has(m.id) ? 'on' : ''}`} onClick={() => toggle(m.id)}>{m.name}</button>)}
          </div>
          {v > 0 && split.size > 0 && <span className="muted" style={{ fontSize: 12 }}>≈ {money(Math.round(toMinor(v) / split.size))} each</span>}
        </div>
        {events.length > 0 && (
          <div className="field"><label>Event (optional)</label>
            <div className="chips"><button type="button" className={`chip ${eventId === '' ? 'on' : ''}`} onClick={() => setEventId('')}>None</button>{events.map((ev) => <button key={ev.id} type="button" className={`chip ${eventId === ev.id ? 'on' : ''}`} onClick={() => setEventId(ev.id)}>{ev.name}</button>)}</div></div>
        )}
        <div className="field"><label htmlFor="xn">Note (optional)</label><input id="xn" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
    </Modal>
  )
}

function PaymentForm({ group, me, item, dispatch, onClose }) {
  const { confirm } = useDialog()
  const ms = listMembers(group)
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [from, setFrom] = useState(item?.from || (ms.some((m) => m.id === me) ? me : ms[0]?.id) || '')
  const [to, setTo] = useState(item?.to || ms.find((m) => m.id !== (item?.from || me))?.id || '')
  const [date, setDate] = useState(item?.date || todayStr())
  const [note, setNote] = useState(item?.note || '')
  const [err, setErr] = useState('')
  const v = parseFloat(amount) || 0

  const save = () => {
    if (!(v > 0)) return setErr('Enter an amount greater than zero.')
    if (!from || !to) return setErr('Choose who paid and who received.')
    if (from === to) return setErr('Pick two different people.')
    dispatch([set('payments', item?.id || uid(), { from, to, amount: v, date, note: note.trim(), settle: item?.settle || false })])
    onClose()
  }
  const del = async () => {
    if (await confirm({ title: 'Delete this payment?', message: 'It is removed for everyone in the group.', confirmText: 'Delete', danger: true })) {
      dispatch([set('payments', item.id, { ...item, deleted: true })])
      onClose()
    }
  }
  return (
    <Modal title={item ? 'Edit payment' : 'New payment'} onClose={onClose}
      footer={<div className="stack" style={{ gap: 8 }}>{err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}<div className="row">{item && <button className="btn danger" aria-label="Delete payment" onClick={del}><Trash2 size={18} /></button>}<button className="btn primary block" onClick={save}>Save</button></div></div>}>
      <div className="stack">
        <div className="field"><label htmlFor="pa">Amount ({currencySymbol()})</label><input id="pa" className="input num" inputMode="decimal" autoFocus value={amount} placeholder="0" onChange={num(setAmount)} /></div>
        <div className="field"><label>From (who paid)</label><Chips items={ms} value={from} onChange={setFrom} /></div>
        <div className="field"><label>To (who received)</label><Chips items={ms} value={to} onChange={setTo} /></div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="pd">Date</label><input id="pd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="pn">Note</label><input id="pn" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
      </div>
    </Modal>
  )
}

function PersonForm({ group, item, dispatch, onClose }) {
  const { alert, confirm } = useDialog()
  const [name, setName] = useState(item?.name || '')
  const [email, setEmail] = useState(item?.email || '')
  const save = () => {
    if (!name.trim()) return
    dispatch([set('members', item?.id || uid(), { name: name.trim(), email: email.trim() })])
    onClose()
  }
  const del = async () => {
    const used = live(group, 'expenses').some((e) => e.paidBy === item.id || e.split.includes(item.id)) || live(group, 'payments').some((p) => p.from === item.id || p.to === item.id)
    if (used) return alert({ title: "Can't remove", message: `${item.name} is part of some expenses or payments. Edit or delete those first.` })
    if (await confirm({ title: `Remove ${item.name}?`, message: 'They are removed from the group.', confirmText: 'Remove', danger: true })) {
      dispatch([set('members', item.id, { ...item, deleted: true })])
      onClose()
    }
  }
  return (
    <Modal title={item ? 'Edit person' : 'New person'} onClose={onClose}
      footer={<div className="row">{item && <button className="btn danger" aria-label="Remove person" onClick={del}><Trash2 size={18} /></button>}<button className="btn primary block" disabled={!name.trim()} onClick={save}>Save</button></div>}>
      <div className="stack">
        <div className="field"><label htmlFor="mn">Name</label><input id="mn" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="me">Email (optional)</label><input id="me" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></div>
      </div>
    </Modal>
  )
}

function EventForm({ item, dispatch, onClose }) {
  const { confirm } = useDialog()
  const [name, setName] = useState(item?.name || '')
  const save = () => { if (name.trim()) { dispatch([set('events', item?.id || uid(), { name: name.trim() })]); onClose() } }
  const del = async () => {
    if (await confirm({ title: `Delete "${item.name}"?`, message: 'Its expenses stay in the group, just without this event.', confirmText: 'Delete', danger: true })) {
      dispatch([set('events', item.id, { ...item, deleted: true })])
      onClose()
    }
  }
  return (
    <Modal title={item ? 'Edit event' : 'New event'} onClose={onClose}
      footer={<div className="row">{item && <button className="btn danger" aria-label="Delete event" onClick={del}><Trash2 size={18} /></button>}<button className="btn primary block" disabled={!name.trim()} onClick={save}>Save</button></div>}>
      <div className="field"><label htmlFor="en">Event name</label><input id="en" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Day 1 · Beach, Birthday party" onKeyDown={(e) => e.key === 'Enter' && save()} /></div>
    </Modal>
  )
}

function RenameForm({ group, dispatch, onClose }) {
  const [name, setName] = useState(group.name)
  return (
    <Modal title="Rename group" onClose={onClose}
      footer={<button className="btn primary block" disabled={!name.trim()} onClick={() => { dispatch([{ t: 'meta', v: { name: name.trim() } }]); onClose() }}>Save</button>}>
      <div className="field"><label htmlFor="rn">Group name</label><input id="rn" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
    </Modal>
  )
}

/* ───────────── settle up / summary / invite ───────────── */

function SettleUp({ group, balances, plan, money, dispatch, readOnly, onClose }) {
  const done = live(group, 'payments').filter((p) => p.settle).sort((a, b) => b.u - a.u)
  const markPaid = (t) => dispatch([set('payments', uid(), { from: t.from, to: t.to, amount: t.amount / 100, date: todayStr(), note: '', settle: true })])
  const undo = (p) => dispatch([set('payments', p.id, { ...p, deleted: true })])
  return (
    <Modal title="Settle up" onClose={onClose} footer={<button className="btn ghost block" onClick={onClose}>Done</button>}>
      <div className="stack">
        <p className="muted" style={{ fontSize: 12.5 }}>The fewest payments that clear everyone's balance.{readOnly ? ' The admin marks payments as paid.' : ' Tick a payment once it has been made.'}</p>
        {plan.length === 0 ? (
          <div className="note-box">Everyone is settled up 🎉</div>
        ) : (
          <div className="card list">
            {plan.map((t) => (
              <label className={`item ${readOnly ? '' : 'check'}`} key={`${t.from}>${t.to}`}>
                {!readOnly && <input type="checkbox" checked={false} onChange={() => markPaid(t)} aria-label={`${memberName(group, t.from)} paid ${memberName(group, t.to)}`} />}
                <span className="main"><div className="t">{memberName(group, t.from)} → {memberName(group, t.to)}</div><div className="s">{memberName(group, t.from)} pays {memberName(group, t.to)}</div></span>
                <span className="amt num">{money(t.amount)}</span>
              </label>
            ))}
          </div>
        )}
        {done.length > 0 && (
          <>
            <div className="lbl-s">Marked as paid</div>
            <div className="card list">
              {done.map((p) => (
                <label className={`item ${readOnly ? '' : 'check'}`} key={p.id}>
                  {!readOnly && <input type="checkbox" checked onChange={() => undo(p)} aria-label={`Undo ${memberName(group, p.from)} paid ${memberName(group, p.to)}`} />}
                  <span className="main"><div className="t">{memberName(group, p.from)} → {memberName(group, p.to)}</div><div className="s">{dmy(p.date)}{readOnly ? ' · paid' : ' · untick to undo'}</div></span>
                  <span className="amt num inc">{money(toMinor(p.amount))}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="lbl-s">Balances</div>
        <div className="card list">
          {balances.map((b) => (
            <div className="item" key={b.id} style={{ padding: '8px 12px' }}>
              <span className="main"><div className="t">{b.name}</div></span>
              <span className={`amt num ${b.net > 0 ? 'inc' : b.net < 0 ? 'exp' : ''}`}>{b.net === 0 ? 'Settled' : `${b.net > 0 ? 'gets' : 'owes'} ${money(Math.abs(b.net))}`}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function Summary({ group, balances, plan, money, onClose }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const filename = `${group.name.replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'group'}-summary.pdf`
  const make = async (share) => {
    setBusy(share ? 'share' : 'download')
    setMsg('')
    try {
      const blob = await buildGroupPdf(group)
      const r = await shareOrDownloadPdf(blob, filename, { share })
      setMsg(r === 'shared' ? 'PDF shared.' : r === 'downloaded' ? 'PDF downloaded.' : '')
    } catch {
      setMsg('Could not create the PDF.')
    } finally {
      setBusy('')
    }
  }
  return (
    <Modal title="Summary" onClose={onClose}
      footer={
        <div className="stack" style={{ gap: 8 }}>
          {msg && <div className="note-box">{msg}</div>}
          <div className="row">
            <button className="btn ghost" style={{ flex: 1 }} disabled={!!busy} onClick={() => make(false)}><FileDown size={16} /> {busy === 'download' ? 'Preparing…' : 'Download PDF'}</button>
            <button className="btn primary" style={{ flex: 1 }} disabled={!!busy} onClick={() => make(true)}><Share2 size={16} /> {busy === 'share' ? 'Preparing…' : 'Share PDF'}</button>
          </div>
        </div>
      }>
      <div className="stack">
        <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '9px 12px' }}><div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>Total spent</div><div className="num" style={{ fontWeight: 800 }}>{money(groupTotal(group))}</div></div>
          <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '9px 12px' }}><div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>Expenses</div><div className="num" style={{ fontWeight: 800 }}>{live(group, 'expenses').length}</div></div>
        </div>
        <div className="lbl-s">Suggested payments</div>
        {plan.length === 0 ? <div className="note-box">Everyone is settled up 🎉</div> : (
          <div className="card list">{plan.map((t) => (
            <div className="item" key={`${t.from}>${t.to}`} style={{ padding: '8px 12px' }}><span className="main"><div className="t">{memberName(group, t.from)} → {memberName(group, t.to)}</div></span><span className="amt num">{money(t.amount)}</span></div>
          ))}</div>
        )}
        <div className="lbl-s">Balances</div>
        <div className="card list">{balances.map((b) => (
          <div className="item" key={b.id} style={{ padding: '8px 12px' }}><span className="main"><div className="t">{b.name}</div><div className="s">Paid {money(b.paid)} · share {money(b.share)}</div></span><span className={`amt num ${b.net > 0 ? 'inc' : b.net < 0 ? 'exp' : ''}`}>{b.net === 0 ? 'Settled' : `${b.net > 0 ? '+' : '−'}${money(Math.abs(b.net))}`}</span></div>
        ))}</div>
        <p className="muted" style={{ fontSize: 12 }}>The PDF also lists every expense and payment.</p>
      </div>
    </Modal>
  )
}

function Invite({ group, onClose }) {
  const [msg, setMsg] = useState('')
  const link = `${window.location.origin}/?view=${group.id}`
  const text = `See who owes what in our group "${group.name}" on PocketZen:\n${link}\n\nNo sign-in needed. It's view only.`
  const copy = async (what, value) => {
    try { await navigator.clipboard.writeText(value); setMsg(`${what} copied.`) } catch { setMsg(value) }
  }
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `Join ${group.name}`, text }); return } catch (e) { if (e?.name === 'AbortError') return }
    }
    copy('Invite message', text)
  }
  return (
    <Modal title="Share this group" onClose={onClose} footer={<button className="btn primary block" onClick={share}><Share2 size={16} /> Share invite</button>}>
      <div className="stack" style={{ textAlign: 'center' }}>
        <p className="muted" style={{ fontSize: 13 }}>Anyone with this link can <b>view</b> the group, with no sign-in. Only the admin can change it.</p>
        <div className="num selectable" aria-label="Group ID" style={{ fontSize: 13, fontWeight: 700, padding: '8px 4px', wordBreak: 'break-all' }}>{formatGroupId(group.id)}</div>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
          <button className="btn sm ghost" onClick={() => copy('Group ID', group.id)}><Copy size={14} /> Copy ID</button>
          <button className="btn sm ghost" onClick={() => copy('Invite link', link)}><Copy size={14} /> Copy link</button>
          <a className="btn sm ghost" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
        </div>
        {msg && <div className="note-box" onClick={() => setMsg('')}>{msg}</div>}
      </div>
    </Modal>
  )
}
