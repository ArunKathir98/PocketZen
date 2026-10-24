import { useMemo, useState } from 'react'
import { CalendarClock, HandCoins, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { emiStats, schedule } from '../lib/emi'
import { addMonths, currencySymbol, fmtDay, money, nowTimeStr, round2, todayStr, uid } from '../lib/util'
import { useDialog } from '../components/dialog'
import { Empty, Modal } from '../components/ui'

const EMI_CATEGORY = 'EMI & Loans'
const dmy = (s) => new Date(s + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function Emi() {
  const { data, remove } = useApp()
  const { confirm } = useDialog()
  const [tab, setTab] = useState('ongoing')
  const [form, setForm] = useState(null)
  const [pay, setPay] = useState(null)
  const [detail, setDetail] = useState(null)

  const rows = useMemo(() => data.emis.map((e) => ({ e, s: emiStats(e) })), [data.emis])
  const ongoing = rows.filter((r) => !r.s.done).sort((a, b) => a.s.nextDue.localeCompare(b.s.nextDue))
  const completed = rows.filter((r) => r.s.done)
  const list = tab === 'ongoing' ? ongoing : completed

  const monthly = round2(ongoing.reduce((s, r) => s + r.e.emiAmount, 0))
  const outstanding = round2(ongoing.reduce((s, r) => s + r.s.remaining, 0))
  const detailRow = rows.find((r) => r.e.id === detail)

  const del = async (e) => {
    if (await confirm({ title: 'Delete EMI?', message: `"${e.name}" and its payment history will be removed. Expenses already recorded stay in Records.`, confirmText: 'Delete', danger: true })) {
      setDetail(null)
      remove('emis', e.id)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>EMIs</h1><p>Loans and instalments you're paying off</p></div>
        <button className="btn primary" onClick={() => setForm({})}><Plus size={18} /> Add EMI</button>
      </div>

      <div className="stack">
        {ongoing.length > 0 && (
          <div className="hero">
            <div className="label">Total outstanding</div>
            <div className="big num">{money(outstanding)}</div>
            <div className="pair">
              <div><span className="l">Monthly EMIs</span><b className="num">{money(monthly)}</b></div>
              <div><span className="l">Ongoing</span><b className="num">{ongoing.length} loan{ongoing.length > 1 ? 's' : ''}</b></div>
            </div>
          </div>
        )}

        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button className={tab === 'ongoing' ? 'on' : ''} onClick={() => setTab('ongoing')}>Ongoing ({ongoing.length})</button>
          <button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Completed ({completed.length})</button>
        </div>

        {list.length === 0 ? (
          <Empty emoji={tab === 'ongoing' ? '🏷️' : '🎉'} title={tab === 'ongoing' ? 'No ongoing EMIs' : 'Nothing completed yet'}
            text={tab === 'ongoing' ? 'Add a loan or purchase on EMI to track what you owe and what is left.' : 'Finished EMIs will show up here.'}
            action={tab === 'ongoing' && <button className="btn primary" onClick={() => setForm({})}>Add EMI</button>} />
        ) : (
          <div className="grid-auto emi-grid">
            {list.map(({ e, s }) => (
              <div className="card pad emi-card" key={e.id}>
                <button className="emi-head" onClick={() => setDetail(e.id)} aria-label={`${e.name} details`}>
                  <span className="ico" style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--g2) 20%, transparent)' }}><HandCoins size={19} color="var(--brand)" /></span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ fontWeight: 800 }}>{e.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{e.lender || 'EMI'} · {money(e.emiAmount)}/mo</div>
                  </span>
                  <span className="num" style={{ fontWeight: 800, textAlign: 'right' }}>
                    <div>{money(s.remaining)}</div><div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>left</div>
                  </span>
                </button>
                <div className="bar" style={{ margin: '12px 0 6px' }}><i style={{ width: `${s.pct}%` }} /></div>
                <div className="row between" style={{ fontSize: 12, fontWeight: 700 }}>
                  <span>{s.paidCount} of {e.totalMonths} paid</span>
                  <span className="muted">{s.pending} month{s.pending !== 1 ? 's' : ''} pending</span>
                </div>
                {!s.done && (
                  <div className="row between" style={{ marginTop: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }} className={s.overdue ? 'exp' : 'muted'}>
                      <CalendarClock size={13} style={{ verticalAlign: '-2px' }} /> {s.overdue ? 'Overdue · ' : 'Next · '}{dmy(s.nextDue)}
                    </span>
                    <button className="btn sm primary" onClick={() => setPay(e)}>Pay EMI</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {form && <EmiForm emi={form} onClose={() => setForm(null)} />}
      {pay && <PayForm emi={pay} onClose={() => setPay(null)} />}
      {detailRow && (
        <Detail row={detailRow} onClose={() => setDetail(null)} onPay={() => { setPay(detailRow.e); }}
          onEdit={() => { setForm(detailRow.e); }} onDelete={() => del(detailRow.e)} />
      )}
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '9px 12px' }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
      <div className={`num ${tone || ''}`} style={{ fontWeight: 800, fontSize: 14 }}>{value}</div>
    </div>
  )
}

function Detail({ row: { e, s }, onClose, onPay, onEdit, onDelete }) {
  const { update, remove } = useApp()
  const { confirm } = useDialog()
  const upcoming = schedule(e, 6)
  const payments = [...(e.payments || [])].reverse()

  const undo = async () => {
    const last = e.payments[e.payments.length - 1]
    if (!last) return
    if (await confirm({ title: 'Undo last payment?', message: `Removes the ${money(last.amount)} payment from ${dmy(last.date)}${last.txId ? ' and its expense record' : ''}.`, confirmText: 'Undo payment', danger: true })) {
      if (last.txId) remove('transactions', last.txId)
      update('emis', e.id, { payments: e.payments.slice(0, -1) })
    }
  }

  return (
    <Modal title={e.name} onClose={onClose}
      footer={
        <div className="row">
          <button className="icon-btn danger" aria-label="Delete EMI" onClick={onDelete}><Trash2 size={17} /></button>
          <button className="icon-btn" aria-label="Edit EMI" onClick={onEdit}><Pencil size={16} /></button>
          {!s.done && <button className="btn primary" style={{ flex: 1 }} onClick={onPay}>Pay EMI · {money(s.nextAmount)}</button>}
        </div>
      }>
      <div className="stack">
        <div>
          <div className="bar"><i style={{ width: `${s.pct}%` }} /></div>
          <div className="row between muted" style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>
            <span>{s.paidCount} / {e.totalMonths} months paid</span><span>{Math.round(s.pct)}%</span>
          </div>
        </div>
        <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Stat label="Total amount" value={money(e.totalAmount)} />
          <Stat label="Monthly EMI" value={money(e.emiAmount)} />
          <Stat label="Paid so far" value={money(s.paidAmount)} tone="inc" />
          <Stat label="Remaining" value={money(s.remaining)} tone="exp" />
          <Stat label="Total months" value={e.totalMonths} />
          <Stat label="Pending months" value={s.pending} />
          <Stat label="First EMI" value={dmy(e.startDate)} />
          <Stat label="Last EMI" value={dmy(s.endDate)} />
        </div>
        {e.lender && <div className="muted" style={{ fontSize: 12.5 }}>Lender / details: <b style={{ color: 'var(--ink)' }}>{e.lender}</b></div>}

        {upcoming.length > 0 && (
          <div>
            <div className="lbl-s" style={{ marginBottom: 6 }}>Upcoming</div>
            <div className="card list">
              {upcoming.map((u, i) => (
                <div className="item" key={u.n} style={{ padding: '8px 12px' }}>
                  <span className="main"><div className="t">Instalment {u.n}</div><div className="s" style={i === 0 && s.overdue ? { color: 'var(--expense)' } : undefined}>{dmy(u.date)}{i === 0 && s.overdue ? ' · overdue' : ''}</div></span>
                  <span className="amt num">{money(u.n === e.totalMonths ? Math.max(0, round2(e.totalAmount - s.paidAmount - e.emiAmount * i)) || e.emiAmount : e.emiAmount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="row between" style={{ marginBottom: 6 }}>
            <div className="lbl-s">Payment history</div>
            {payments.length > 0 && <button className="btn sm ghost" onClick={undo}><Undo2 size={14} /> Undo last</button>}
          </div>
          {payments.length === 0 && !e.paidBefore ? <p className="muted" style={{ fontSize: 12.5 }}>No payments recorded yet.</p> : (
            <div className="card list">
              {payments.map((p) => (
                <div className="item" key={p.id} style={{ padding: '8px 12px' }}>
                  <span className="main"><div className="t">{dmy(p.date)}</div><div className="s">{p.txId ? 'Recorded as expense' : 'Not added to records'}</div></span>
                  <span className="amt num inc">{money(p.amount)}</span>
                </div>
              ))}
              {e.paidBefore > 0 && (
                <div className="item" style={{ padding: '8px 12px' }}>
                  <span className="main"><div className="t">{e.paidBefore} earlier instalment{e.paidBefore > 1 ? 's' : ''}</div><div className="s">Paid before tracking</div></span>
                  <span className="amt num inc">{money(e.paidBefore * e.emiAmount)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function PayForm({ emi, onClose }) {
  const { data, add, update } = useApp()
  const s = emiStats(emi)
  const [amount, setAmount] = useState(String(s.nextAmount))
  const [date, setDate] = useState(todayStr())
  const [accountId, setAccountId] = useState(emi.accountId || data.accounts[0]?.id || '') // '' = don't record
  const v = parseFloat(amount) || 0

  const save = () => {
    if (!(v > 0)) return
    let txId = null
    if (accountId) {
      let cat = data.categories.find((c) => c.type === 'expense' && c.name === EMI_CATEGORY)
      if (!cat) cat = add('categories', { type: 'expense', name: EMI_CATEGORY, icon: '🏷️', color: '#6366f1' })
      txId = add('transactions', { type: 'expense', amount: round2(v), accountId, toAccountId: null, categoryId: cat.id, note: `EMI · ${emi.name}`, date, time: nowTimeStr() }).id
    }
    update('emis', emi.id, { payments: [...(emi.payments || []), { id: uid(), date, amount: round2(v), txId }] })
    onClose()
  }

  return (
    <Modal title={`Pay EMI · ${emi.name}`} onClose={onClose}
      footer={<button className="btn primary block" disabled={!(v > 0)} onClick={save}>Mark as paid</button>}>
      <div className="stack">
        <div className="note-box">Instalment {s.paidCount + 1} of {emi.totalMonths} · due {dmy(s.nextDue)}</div>
        <div className="field"><label htmlFor="pa">Amount ({currencySymbol()})</label>
          <input id="pa" className="input num" inputMode="decimal" autoFocus value={amount} onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setAmount(e.target.value)} /></div>
        <div className="field"><label htmlFor="pd">Paid on</label><input id="pd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label>Pay from (adds an expense to Records)</label>
          <div className="chips">
            {data.accounts.map((a) => (
              <button key={a.id} type="button" className={`chip ${accountId === a.id ? 'on' : ''}`} onClick={() => setAccountId(a.id)}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.color }} />{a.name}
              </button>
            ))}
            <button type="button" className={`chip ${accountId === '' ? 'on' : ''}`} onClick={() => setAccountId('')}>Don't record</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function EmiForm({ emi, onClose }) {
  const { data, add, update } = useApp()
  const editing = !!emi.id
  const [name, setName] = useState(emi.name || '')
  const [lender, setLender] = useState(emi.lender || '')
  const [total, setTotal] = useState(emi.totalAmount ? String(emi.totalAmount) : '')
  const [months, setMonths] = useState(emi.totalMonths ? String(emi.totalMonths) : '')
  const [emiAmt, setEmiAmt] = useState(emi.emiAmount ? String(emi.emiAmount) : '')
  const [touched, setTouched] = useState(!!emi.emiAmount)
  const [start, setStart] = useState(emi.startDate || todayStr())
  const [before, setBefore] = useState(emi.paidBefore ? String(emi.paidBefore) : '')
  const [accountId, setAccountId] = useState(emi.accountId || '')

  const t = parseFloat(total) || 0
  const m = parseInt(months) || 0
  const auto = t && m ? round2(t / m) : 0
  const e = touched ? parseFloat(emiAmt) || 0 : auto
  const b = Math.min(parseInt(before) || 0, m)
  const valid = name.trim() && t > 0 && m > 0 && e > 0
  const logged = (emi.payments || []).length

  const save = () => {
    if (!valid) return
    const v = { name: name.trim(), lender: lender.trim(), totalAmount: t, totalMonths: m, emiAmount: e, startDate: start, paidBefore: Math.max(0, Math.min(b, m - logged)), accountId }
    editing ? update('emis', emi.id, v) : add('emis', { ...v, payments: [] })
    onClose()
  }

  const num = (set, dec) => (ev) => (dec ? /^\d*\.?\d{0,2}$/ : /^\d*$/).test(ev.target.value) && set(ev.target.value)

  return (
    <Modal title={editing ? 'Edit EMI' : 'New EMI'} onClose={onClose}
      footer={<button className="btn primary block" disabled={!valid} onClick={save}>Save</button>}>
      <div className="stack">
        <div className="field"><label htmlFor="en">Name</label><input id="en" className="input" autoFocus value={name} onChange={(ev) => setName(ev.target.value)} placeholder="e.g. Car loan, iPhone EMI" /></div>
        <div className="field"><label htmlFor="el">Lender / details (optional)</label><input id="el" className="input" value={lender} onChange={(ev) => setLender(ev.target.value)} placeholder="Bank, loan number…" /></div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="et">Total amount ({currencySymbol()})</label><input id="et" className="input num" inputMode="decimal" value={total} placeholder="0" onChange={num(setTotal, true)} /></div>
          <div className="field"><label htmlFor="em">Total months</label><input id="em" className="input num" inputMode="numeric" value={months} placeholder="12" onChange={num(setMonths)} /></div>
        </div>
        <div className="field"><label htmlFor="ee">Monthly EMI ({currencySymbol()})</label>
          <input id="ee" className="input num" inputMode="decimal" value={touched ? emiAmt : auto ? String(auto) : ''} placeholder="Auto: total ÷ months"
            onChange={(ev) => { setTouched(true); num(setEmiAmt, true)(ev) }} />
          <span className="muted" style={{ fontSize: 11.5 }}>Total amount is what you will pay in all, including interest.</span>
        </div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="es">First EMI date</label><input id="es" type="date" className="input" value={start} onChange={(ev) => setStart(ev.target.value)} /></div>
          <div className="field"><label htmlFor="eb">Already paid (months)</label><input id="eb" className="input num" inputMode="numeric" value={before} placeholder="0" onChange={num(setBefore)} /></div>
        </div>
        <div className="field"><label>Usually paid from</label>
          <div className="chips">
            <button type="button" className={`chip ${accountId === '' ? 'on' : ''}`} onClick={() => setAccountId('')}>Ask each time</button>
            {data.accounts.map((a) => (
              <button key={a.id} type="button" className={`chip ${accountId === a.id ? 'on' : ''}`} onClick={() => setAccountId(a.id)}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.color }} />{a.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
