import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { INTEREST_TYPES, buildStatement, interestSummary, loanLabel, loanStats, personSummary, suggestSplit } from '../lib/loans'
import { currencySymbol, money, nowTimeStr, round2, todayStr, uid } from '../lib/util'
import { useDialog } from '../components/dialog'
import { Empty, Modal, Toggle } from '../components/ui'

const dmy = (s) => new Date(s + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const COLORS = ['#14b8a6', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#22c55e', '#3b82f6']
const colorOf = (s) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const num = (set, dec = true) => (e) => (dec ? /^\d*\.?\d{0,2}$/ : /^\d*$/).test(e.target.value) && set(e.target.value)

// categories used when an event is also recorded in an account
const CATS = {
  lent: { name: 'Money lent', type: 'expense', icon: '🤝', color: '#f97316' },
  borrowed: { name: 'Money borrowed', type: 'income', icon: '🤝', color: '#6366f1' },
  receivedBack: { name: 'Loan repayment received', type: 'income', icon: '💰', color: '#14b8a6' },
  paidBack: { name: 'Loan repayment paid', type: 'expense', icon: '💸', color: '#ef4444' },
}

function usePost() {
  const { data, add } = useApp()
  return (kind, loan, { accountId, amount, date, note, who }) => {
    if (!accountId) return null
    const key = kind === 'principal' ? loan.direction === 'lent' ? 'lent' : 'borrowed' : loan.direction === 'lent' ? 'receivedBack' : 'paidBack'
    const c = CATS[key]
    const cat = data.categories.find((x) => x.type === c.type && x.name === c.name) || add('categories', { type: c.type, name: c.name, icon: c.icon, color: c.color })
    return add('transactions', { type: c.type, amount: round2(amount), accountId, toAccountId: null, categoryId: cat.id, note: [who, note].filter(Boolean).join(' · '), date, time: nowTimeStr() }).id
  }
}

function Stat({ label, value, tone, wide }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '9px 12px', gridColumn: wide ? '1 / -1' : undefined }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
      <div className={`num ${tone || ''}`} style={{ fontWeight: 800, fontSize: 14 }}>{value}</div>
    </div>
  )
}

function AccountPicker({ value, onChange, label = 'Also record in an account' }) {
  const { data } = useApp()
  if (!data.accounts.length) return null
  return (
    <div className="field"><label>{label}</label>
      <div className="chips">
        <button type="button" className={`chip ${value === '' ? 'on' : ''}`} onClick={() => onChange('')}>Don't record</button>
        {data.accounts.map((a) => (
          <button key={a.id} type="button" className={`chip ${value === a.id ? 'on' : ''}`} onClick={() => onChange(a.id)}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.color }} />{a.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ───────────────────────── page ───────────────────────── */

export default function Loans() {
  const { data } = useApp()
  const [tab, setTab] = useState('active')
  const [form, setForm] = useState(null)
  const [personId, setPersonId] = useState(null)

  const rows = useMemo(
    () => data.people.map((p) => ({ p, s: personSummary(p, data.loans), n: data.loans.filter((l) => l.personId === p.id).length })),
    [data.people, data.loans],
  )
  const active = rows.filter((r) => r.s.active > 0)
  const settled = rows.filter((r) => r.s.active === 0)
  const list = (tab === 'active' ? active : settled).sort((a, b) => Math.abs(b.s.net) - Math.abs(a.s.net))
  const receive = round2(active.reduce((t, r) => t + r.s.receive, 0))
  const pay = round2(active.reduce((t, r) => t + r.s.pay, 0))
  const interestDue = round2(active.reduce((t, r) => t + r.s.interestDueToReceive, 0))

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Loans &amp; people</h1><p>Money lent or borrowed, with optional interest</p></div>
        <button className="btn primary" onClick={() => setForm({})}><Plus size={18} /> Add</button>
      </div>
      <div className="stack">
        {active.length > 0 && (
          <div className="hero">
            <div className="label">You will receive</div>
            <div className="big num">{money(receive)}</div>
            <div className="pair">
              <div><span className="l"><ArrowUpRight size={14} /> You owe</span><b className="num">{money(pay)}</b></div>
              <div><span className="l"><ArrowDownLeft size={14} /> Interest due to you</span><b className="num">{money(interestDue)}</b></div>
            </div>
          </div>
        )}

        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>Active ({active.length})</button>
          <button className={tab === 'settled' ? 'on' : ''} onClick={() => setTab('settled')}>Settled ({settled.length})</button>
        </div>

        {list.length === 0 ? (
          <Empty emoji={tab === 'active' ? '🤝' : '✅'} title={tab === 'active' ? 'No one owes anything' : 'Nothing settled yet'}
            text={tab === 'active' ? 'Add money you lent or borrowed to keep track of balances and interest.' : 'Fully repaid people appear here.'}
            action={tab === 'active' && <button className="btn primary" onClick={() => setForm({})}>Add a loan</button>} />
        ) : (
          <div className="card list">
            {list.map(({ p, s, n }) => (
              <button className="item" key={p.id} onClick={() => setPersonId(p.id)}>
                <span className="ico" style={{ background: `${colorOf(p.name)}26`, color: colorOf(p.name), fontWeight: 800 }}>{p.name[0]?.toUpperCase()}</span>
                <span className="main">
                  <div className="t">{p.name}</div>
                  <div className="s">{s.active ? `${s.active} active loan${s.active > 1 ? 's' : ''}` : `${n} loan${n === 1 ? '' : 's'} · settled`}{s.interestDueToReceive > 0 ? ` · interest due ${money(s.interestDueToReceive)}` : ''}</div>
                </span>
                <span className={`amt ${s.net > 0 ? 'inc' : s.net < 0 ? 'exp' : ''}`} style={{ textAlign: 'right' }}>
                  {money(Math.abs(s.net))}
                  <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>{s.net > 0 ? 'owes you' : s.net < 0 ? 'you owe' : 'settled'}</div>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {personId && <PersonDetail personId={personId} onClose={() => setPersonId(null)} onAddLoan={() => setForm({ personId })} />}
      {/* rendered after the person screen so it opens on top of it */}
      {form && <LoanForm loan={form.id ? form : null} presetPerson={form.personId} onClose={() => setForm(null)} />}
    </div>
  )
}

/* ───────────────────────── person ───────────────────────── */

function PersonDetail({ personId, onClose, onAddLoan }) {
  const { data, remove } = useApp()
  const { confirm, alert } = useDialog()
  const [loanId, setLoanId] = useState(null)
  const [edit, setEdit] = useState(false)
  const [msg, setMsg] = useState('')
  const person = data.people.find((p) => p.id === personId)
  if (!person) return null
  const loans = data.loans.filter((l) => l.personId === personId)
  const sum = personSummary(person, data.loans)

  const statement = async () => {
    const text = buildStatement(person, data.loans, money)
    if (navigator.share) {
      try { await navigator.share({ title: `Statement — ${person.name}`, text }); return } catch (e) { if (e?.name === 'AbortError') return }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  const del = async () => {
    if (loans.length) return alert({ title: "Can't delete yet", message: `Delete ${person.name}'s loans first.` })
    if (await confirm({ title: `Delete ${person.name}?`, message: 'This person will be removed.', confirmText: 'Delete', danger: true })) {
      remove('people', person.id)
      onClose()
    }
  }

  return (
    <Modal title={person.name} onClose={onClose}
      footer={
        <div className="row">
          <button className="icon-btn danger" aria-label="Delete person" onClick={del}><Trash2 size={17} /></button>
          <button className="icon-btn" aria-label="Edit person" onClick={() => setEdit(true)}><Pencil size={16} /></button>
          <button className="btn ghost" style={{ flex: 1 }} onClick={statement} disabled={!loans.length}><Send size={16} /> Send statement</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={onAddLoan}><Plus size={16} /> Add loan</button>
        </div>
      }>
      <div className="stack">
        {person.note && <div className="muted" style={{ fontSize: 12.5 }}>{person.note}</div>}
        <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Stat label="They owe you" value={money(sum.receive)} tone="inc" />
          <Stat label="You owe them" value={money(sum.pay)} tone="exp" />
          <Stat label="Net" value={`${money(Math.abs(sum.net))} ${sum.net > 0 ? 'to receive' : sum.net < 0 ? 'to pay' : ''}`} wide />
        </div>
        {msg && <div className="note-box" onClick={() => setMsg('')}>{msg}</div>}
        {loans.length === 0 ? <p className="muted">No loans yet.</p> : (
          <div className="card list">
            {loans.map((l) => {
              const s = loanStats(l)
              return (
                <button className="item" key={l.id} onClick={() => setLoanId(l.id)}>
                  <span className="ico" style={{ background: l.direction === 'lent' ? 'color-mix(in srgb, var(--income) 18%, transparent)' : 'color-mix(in srgb, var(--expense) 16%, transparent)' }}>
                    {l.direction === 'lent' ? <ArrowUpRight size={19} color="var(--income)" /> : <ArrowDownLeft size={19} color="var(--expense)" />}
                  </span>
                  <span className="main">
                    <div className="t">{loanLabel(l)}</div>
                    <div className="s">{l.direction === 'lent' ? 'You gave' : 'You took'} {money(s.principalIn)} · {interestSummary(l)}</div>
                  </span>
                  <span className="amt" style={{ textAlign: 'right' }}>
                    {s.settled ? <span className="muted">Settled</span> : money(s.outstanding)}
                    {!s.settled && <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>to settle</div>}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {loanId && <LoanDetail loanId={loanId} onClose={() => setLoanId(null)} />}
      {edit && <PersonForm person={person} onClose={() => setEdit(false)} onSaved={(m) => { setMsg(m); setEdit(false) }} />}
    </Modal>
  )
}

function PersonForm({ person, onClose, onSaved }) {
  const { update } = useApp()
  const [name, setName] = useState(person.name)
  const [note, setNote] = useState(person.note || '')
  return (
    <Modal title="Edit person" onClose={onClose}
      footer={<button className="btn primary block" disabled={!name.trim()} onClick={() => { update('people', person.id, { name: name.trim(), note: note.trim() }); onSaved('Saved.') }}>Save</button>}>
      <div className="stack">
        <div className="field"><label htmlFor="pn">Name</label><input id="pn" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="pt">Note (phone, relation…)</label><input id="pt" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
    </Modal>
  )
}

/* ───────────────────────── loan detail ───────────────────────── */

const EVENT_TITLE = (e, loan, first) => {
  const lent = loan.direction === 'lent'
  if (e.kind === 'principal') return first ? (lent ? 'You gave' : 'You took') : lent ? 'You gave more' : 'You took more'
  if (e.kind === 'payment') return lent ? 'They paid back' : 'You paid back'
  if (e.kind === 'interest') return 'Interest charged'
  return 'Interest terms changed'
}

function LoanDetail({ loanId, onClose }) {
  const { data, update, remove } = useApp()
  const { confirm } = useDialog()
  const [action, setAction] = useState(null) // 'payment' | 'principal' | 'interest' | 'terms'
  const [edit, setEdit] = useState(false)
  const loan = data.loans.find((l) => l.id === loanId)
  if (!loan) return null
  const person = data.people.find((p) => p.id === loan.personId)
  const s = loanStats(loan)
  const lent = loan.direction === 'lent'
  const events = [...loan.events].map((e, i) => ({ e, i })).sort((a, b) => (a.e.date === b.e.date ? b.i - a.i : a.e.date < b.e.date ? 1 : -1))
  const firstId = loan.events.find((e) => e.kind === 'principal')?.id
  const tone = lent ? 'inc' : 'exp'

  const delEvent = async (e) => {
    if (await confirm({ title: 'Delete this entry?', message: e.txId ? 'Its record in your account is removed too.' : 'This cannot be undone.', confirmText: 'Delete', danger: true })) {
      if (e.txId) remove('transactions', e.txId)
      update('loans', loan.id, { events: loan.events.filter((x) => x.id !== e.id) })
    }
  }
  const delLoan = async () => {
    if (await confirm({ title: 'Delete this loan?', message: 'All its entries are removed. Records already added to your accounts stay.', confirmText: 'Delete', danger: true })) {
      onClose()
      remove('loans', loan.id)
    }
  }
  const canTerms = loan.interest.type === 'fixed' || loan.interest.type === 'simple' || loan.interest.type === 'compound'

  return (
    <Modal title={`${person?.name || ''} · ${loanLabel(loan)}`} onClose={onClose}
      footer={
        <div className="row">
          <button className="icon-btn danger" aria-label="Delete loan" onClick={delLoan}><Trash2 size={17} /></button>
          <button className="icon-btn" aria-label="Edit loan" onClick={() => setEdit(true)}><Pencil size={16} /></button>
          {!s.settled && <button className="btn primary" style={{ flex: 1 }} onClick={() => setAction('payment')}>{lent ? 'Record payment received' : 'Record payment made'}</button>}
        </div>
      }>
      <div className="stack">
        <div className="row between wrap" style={{ fontSize: 12.5 }}>
          <span className="chip on">{lent ? 'You gave' : 'You took'} · {interestSummary(loan)}</span>
          <span className="muted">since {dmy(loan.startDate)}{loan.dueDate ? ` · due ${dmy(loan.dueDate)}` : ''}</span>
        </div>
        <div>
          <div className="bar"><i style={{ width: `${s.pct}%` }} /></div>
          <div className="row between muted" style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}><span>Principal repaid</span><span>{Math.round(s.pct)}%</span></div>
        </div>
        <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Stat label={lent ? 'Amount given' : 'Amount taken'} value={money(s.principalIn)} />
          <Stat label="Principal balance" value={money(s.principalBalance)} tone={tone} />
          <Stat label="Principal paid" value={money(s.principalPaid)} />
          <Stat label="Interest charged" value={money(s.interestAccrued)} />
          <Stat label="Interest paid" value={money(s.interestPaid)} />
          <Stat label="Interest due" value={money(Math.max(0, s.interestDue))} tone={s.interestDue > 0 ? tone : ''} />
          <Stat label={s.settled ? 'Status' : 'Total to settle'} value={s.settled ? 'Settled ✅' : money(s.outstanding)} tone={s.settled ? '' : tone} wide />
          {s.nextInterestOn && <Stat label="Next interest day" value={dmy(s.nextInterestOn)} wide />}
        </div>
        {s.interestDue < 0 && <div className="note-box">Interest paid in advance: {money(-s.interestDue)}</div>}

        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn sm ghost" onClick={() => setAction('principal')}>{lent ? '+ Give more' : '+ Take more'}</button>
          {(loan.interest.type === 'manual' || loan.interest.type === 'fixed' || loan.interest.type === 'simple' || loan.interest.type === 'compound') && (
            <button className="btn sm ghost" onClick={() => setAction('interest')}>+ Interest charge</button>
          )}
          {canTerms && <button className="btn sm ghost" onClick={() => setAction('terms')}>Change interest</button>}
        </div>

        <div>
          <div className="lbl-s" style={{ marginBottom: 6 }}>History</div>
          <div className="card list">
            {events.map(({ e }) => (
              <div className="item" key={e.id} style={{ padding: '8px 12px' }}>
                <span className="main">
                  <div className="t">{EVENT_TITLE(e, loan, e.id === firstId)}{e.kind === 'terms' ? '' : ` · ${money(e.amount)}`}</div>
                  <div className="s">
                    {dmy(e.date)}
                    {e.kind === 'payment' && ` · principal ${money(e.principalPart ?? e.amount)} · interest ${money(e.interestPart ?? 0)}`}
                    {e.kind === 'terms' && ` · ${e.rate != null && e.rate !== '' ? `${e.rate}% per ${loan.interest.period === 'year' ? 'year' : 'month'}` : `${money(e.amount)} / month`}`}
                    {e.note ? ` · ${e.note}` : ''}{e.txId ? ' · in records' : ''}
                  </div>
                </span>
                {e.id !== firstId && <button className="icon-btn danger" style={{ width: 30, height: 30 }} aria-label="Delete entry" onClick={() => delEvent(e)}><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {action && <EventForm loanId={loan.id} kind={action} onClose={() => setAction(null)} />}
      {edit && <LoanForm loan={loan} onClose={() => setEdit(false)} />}
    </Modal>
  )
}

/* ───────────────────────── event forms ───────────────────────── */

function EventForm({ loanId, kind, onClose }) {
  const { data, update } = useApp()
  const post = usePost()
  const loan = data.loans.find((l) => l.id === loanId)
  const lent = loan.direction === 'lent'
  const person = data.people.find((p) => p.id === loan.personId)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState('')
  const [custom, setCustom] = useState(false)
  const [interestIn, setInterestIn] = useState('')
  const [rate, setRate] = useState('')
  const [err, setErr] = useState('')

  const stats = useMemo(() => loanStats(loan, date), [loan, date])
  const v = parseFloat(amount) || 0
  const split = custom ? { interestPart: Math.min(parseFloat(interestIn) || 0, v), principalPart: round2(v - Math.min(parseFloat(interestIn) || 0, v)) } : suggestSplit(stats, v)

  const title = { payment: lent ? 'Payment received' : 'Payment made', principal: lent ? 'Give more money' : 'Take more money', interest: 'Add interest charge', terms: 'Change interest' }[kind]

  const save = () => {
    setErr('')
    if (kind === 'terms') {
      const t = parseFloat(rate)
      if (!(t >= 0) || rate === '') return setErr('Enter the new value.')
      const ev = { id: uid(), kind: 'terms', date, ...(loan.interest.type === 'fixed' ? { amount: t } : { rate: t }), note: note.trim() }
      update('loans', loan.id, { events: [...loan.events, ev] })
      return onClose()
    }
    if (!(v > 0)) return setErr('Enter an amount greater than zero.')
    if (kind === 'payment' && split.principalPart > stats.principalBalance + 0.005) return setErr(`Principal part is more than the balance (${money(stats.principalBalance)}). Put the extra under interest.`)
    const ev = { id: uid(), kind, date, amount: round2(v), note: note.trim() }
    if (kind === 'payment') {
      ev.interestPart = round2(split.interestPart)
      ev.principalPart = round2(split.principalPart)
    }
    if (kind === 'payment' || kind === 'principal') {
      ev.accountId = accountId || null
      ev.txId = post(kind, loan, { accountId, amount: v, date, note: note.trim(), who: person?.name })
    }
    update('loans', loan.id, { events: [...loan.events, ev] })
    onClose()
  }

  return (
    <Modal title={title} onClose={onClose}
      footer={<div className="stack" style={{ gap: 8 }}>{err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}<button className="btn primary block" onClick={save}>Save</button></div>}>
      <div className="stack">
        {kind !== 'terms' && (
          <div className="field"><label htmlFor="ea">Amount ({currencySymbol()})</label>
            <input id="ea" className="input num" inputMode="decimal" autoFocus value={amount} placeholder="0" onChange={num(setAmount)} /></div>
        )}
        {kind === 'terms' && (
          <div className="field"><label htmlFor="er">{loan.interest.type === 'fixed' ? `New monthly interest (${currencySymbol()})` : `New rate (% per ${loan.interest.period === 'year' ? 'year' : 'month'})`}</label>
            <input id="er" className="input num" inputMode="decimal" autoFocus value={rate} placeholder="0" onChange={num(setRate)} />
            <span className="muted" style={{ fontSize: 11.5 }}>Applies from the date below. Earlier interest stays as it was.</span></div>
        )}
        <div className="field"><label htmlFor="ed">{kind === 'terms' ? 'From date' : 'Date'}</label><input id="ed" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>

        {kind === 'payment' && (
          <>
            <div className="note-box">
              On {dmy(date)}: interest due <b className="num">{money(Math.max(0, stats.interestDue))}</b> · principal balance <b className="num">{money(stats.principalBalance)}</b>
            </div>
            <div className="field"><label>How is it split?</label>
              <div className="seg full">
                <button className={!custom ? 'on' : ''} onClick={() => setCustom(false)}>Interest first</button>
                <button className={custom ? 'on' : ''} onClick={() => setCustom(true)}>Custom</button>
              </div>
            </div>
            {custom && (
              <div className="field"><label htmlFor="ei">Interest part ({currencySymbol()})</label>
                <input id="ei" className="input num" inputMode="decimal" value={interestIn} placeholder="0" onChange={num(setInterestIn)} /></div>
            )}
            {v > 0 && <div className="row between" style={{ fontSize: 13, fontWeight: 700 }}><span>Interest <b className="num">{money(split.interestPart)}</b></span><span>Principal <b className="num">{money(split.principalPart)}</b></span></div>}
          </>
        )}
        {kind !== 'terms' && <div className="field"><label htmlFor="en">Note (optional)</label><input id="en" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>}
        {(kind === 'payment' || kind === 'principal') && <AccountPicker value={accountId} onChange={setAccountId} label={lent ? (kind === 'payment' ? 'Add to account (as income)' : 'Take from account (as expense)') : (kind === 'payment' ? 'Pay from account (as expense)' : 'Add to account (as income)')} />}
      </div>
    </Modal>
  )
}

/* ───────────────────────── loan form ───────────────────────── */

function LoanForm({ loan, presetPerson, onClose }) {
  const { data, add, update } = useApp()
  const post = usePost()
  const editing = !!loan
  const [personId, setPersonId] = useState(loan?.personId || presetPerson || (data.people.length ? '' : 'new'))
  const [newName, setNewName] = useState('')
  const [direction, setDirection] = useState(loan?.direction || 'lent')
  const [title, setTitle] = useState(loan?.title || '')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(loan?.startDate || todayStr())
  const [type, setType] = useState(loan?.interest.type || 'none')
  const [fixed, setFixed] = useState(loan?.interest.amount ? String(loan.interest.amount) : '')
  const [rate, setRate] = useState(loan?.interest.rate ? String(loan.interest.rate) : '')
  const [period, setPeriod] = useState(loan?.interest.period || 'month')
  const [dueDate, setDueDate] = useState(loan?.dueDate || '')
  const [remind, setRemind] = useState(loan ? !!loan.remind : true)
  const [note, setNote] = useState(loan?.note || '')
  const [accountId, setAccountId] = useState('')
  const [err, setErr] = useState('')

  const v = parseFloat(amount) || 0
  const lent = direction === 'lent'

  const save = () => {
    setErr('')
    let pid = personId
    if (!editing && (pid === 'new' || pid === '') && !newName.trim()) return setErr('Choose a person or enter a name.')
    if (!editing && !(v > 0)) return setErr('Enter the amount.')
    if ((type === 'fixed' && !(parseFloat(fixed) > 0)) || ((type === 'simple' || type === 'compound') && !(parseFloat(rate) > 0))) return setErr('Enter the interest value.')
    const interest = {
      type,
      ...(type === 'fixed' ? { amount: parseFloat(fixed) } : {}),
      ...(type === 'simple' || type === 'compound' ? { rate: parseFloat(rate), period } : {}),
    }
    const common = { title: title.trim(), interest, dueDate, remind, note: note.trim() }
    if (editing) {
      update('loans', loan.id, { ...common, direction })
      return onClose()
    }
    if (pid === 'new' || pid === '') {
      const existing = data.people.find((p) => p.name.trim().toLowerCase() === newName.trim().toLowerCase())
      pid = existing ? existing.id : add('people', { name: newName.trim(), note: '' }).id
    }
    const l = { personId: pid, direction, startDate, ...common, events: [] }
    const who = data.people.find((p) => p.id === pid)?.name || newName.trim()
    const txId = post('principal', { direction }, { accountId, amount: v, date: startDate, note: common.title, who })
    l.events = [{ id: uid(), kind: 'principal', date: startDate, amount: round2(v), note: '', accountId: accountId || null, txId }]
    add('loans', l)
    onClose()
  }

  return (
    <Modal title={editing ? 'Edit loan' : 'New loan'} onClose={onClose}
      footer={<div className="stack" style={{ gap: 8 }}>{err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}<button className="btn primary block" onClick={save}>Save</button></div>}>
      <div className="stack">
        {!editing && (
          <div className="field"><label>Person</label>
            <div className="chips">
              {data.people.map((p) => <button key={p.id} type="button" className={`chip ${personId === p.id ? 'on' : ''}`} onClick={() => setPersonId(p.id)}>{p.name}</button>)}
              <button type="button" className={`chip ${personId === 'new' || personId === '' ? 'on' : ''}`} onClick={() => setPersonId('new')}>+ New person</button>
            </div>
            {(personId === 'new' || personId === '') && <input className="input" style={{ marginTop: 8 }} autoFocus placeholder="Name" aria-label="New person name" value={newName} onChange={(e) => setNewName(e.target.value)} />}
          </div>
        )}
        <div className="seg full">
          <button className={direction === 'lent' ? 'on' : ''} onClick={() => setDirection('lent')}>I gave</button>
          <button className={`exp-on ${direction === 'borrowed' ? 'on' : ''}`} onClick={() => setDirection('borrowed')}>I took</button>
        </div>
        {!editing && (
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field"><label htmlFor="la">Amount ({currencySymbol()})</label><input id="la" className="input num" inputMode="decimal" value={amount} placeholder="0" onChange={num(setAmount)} /></div>
            <div className="field"><label htmlFor="ls">Date</label><input id="ls" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          </div>
        )}
        <div className="field"><label htmlFor="lt">Title (optional)</label><input id="lt" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bike repair, Business loan" /></div>

        <div className="field"><label>Interest</label>
          <div className="chips">{INTEREST_TYPES.map((t) => <button key={t.id} type="button" className={`chip ${type === t.id ? 'on' : ''}`} onClick={() => setType(t.id)}>{t.label}</button>)}</div>
        </div>
        {type === 'fixed' && (
          <div className="field"><label htmlFor="lf">Interest every month ({currencySymbol()})</label><input id="lf" className="input num" inputMode="decimal" value={fixed} placeholder="0" onChange={num(setFixed)} /></div>
        )}
        {(type === 'simple' || type === 'compound') && (
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field"><label htmlFor="lr">Rate (%)</label><input id="lr" className="input num" inputMode="decimal" value={rate} placeholder="2" onChange={num(setRate)} /></div>
            <div className="field"><label>Per</label>
              <div className="seg full"><button className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>Month</button><button className={period === 'year' ? 'on' : ''} onClick={() => setPeriod('year')}>Year</button></div></div>
          </div>
        )}
        {type === 'manual' && <p className="muted" style={{ fontSize: 12.5 }}>Nothing is calculated automatically. Add each interest amount yourself from the loan screen.</p>}
        {type === 'compound' && <p className="muted" style={{ fontSize: 12.5 }}>Unpaid interest is added to the balance every month and earns interest too.</p>}

        <div className="field"><label htmlFor="ld">Repay by (optional)</label><input id="ld" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        <div className="setting" style={{ padding: '4px 0', borderTop: 0 }}>
          <span className="si"><CalendarClock size={18} /></span>
          <span className="main"><div className="t">Remind me</div><div className="s">On interest days and the repay-by date</div></span>
          <Toggle on={remind} onChange={setRemind} label="Remind me" />
        </div>
        <div className="field"><label htmlFor="lnote">Note (optional)</label><input id="lnote" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {!editing && <AccountPicker value={accountId} onChange={setAccountId} label={lent ? 'Take from account (adds an expense)' : 'Add to account (adds an income)'} />}
      </div>
    </Modal>
  )
}
