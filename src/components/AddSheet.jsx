import { useMemo, useState } from 'react'
import { ArrowRightLeft, Trash2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { monthSpentByCategory } from '../lib/calc'
import { currencySymbol, money, nowTimeStr, round2, todayStr } from '../lib/util'
import { Modal } from './ui'
import { useDialog } from './dialog'

export default function AddSheet({ initial, defaultDate, onClose }) {
  const { data, add, update, remove } = useApp()
  const { confirm } = useDialog()
  const editing = !!initial?.id
  const [type, setType] = useState(initial?.type || 'expense')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [accountId, setAccountId] = useState(initial?.accountId || data.accounts[0]?.id || '')
  const [toAccountId, setToAccountId] = useState(
    initial?.toAccountId || data.accounts.find((a) => a.id !== (initial?.accountId || data.accounts[0]?.id))?.id || '',
  )
  const [categoryId, setCategoryId] = useState(initial?.categoryId || '')
  const [note, setNote] = useState(initial?.note || '')
  const [date, setDate] = useState(initial?.date || defaultDate || todayStr())
  const [time, setTime] = useState(initial?.time || nowTimeStr())
  const [err, setErr] = useState('')

  const cats = useMemo(() => data.categories.filter((c) => c.type === type), [data.categories, type])
  const value = parseFloat(amount) || 0

  const budget = type === 'expense' && categoryId ? data.budgets.find((b) => b.categoryId === categoryId) : null
  const spent = budget ? monthSpentByCategory(data.transactions, categoryId, date, initial?.id) : 0
  const remaining = budget ? round2(budget.amount - spent) : 0
  const after = round2(remaining - value)

  const switchType = (t) => {
    setType(t)
    setCategoryId('')
    setErr('')
  }

  const save = () => {
    if (!(value > 0)) return setErr('Enter an amount greater than zero.')
    if (!accountId) return setErr('Choose an account (add one in Accounts first).')
    if (type === 'transfer') {
      if (!toAccountId) return setErr('Choose the account to transfer to.')
      if (toAccountId === accountId) return setErr('Pick two different accounts.')
    } else if (!categoryId) return setErr('Choose a category.')
    const tx = {
      type,
      amount: round2(value),
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
      note: note.trim(),
      date,
      time,
    }
    if (editing) update('transactions', initial.id, tx)
    else add('transactions', tx)
    onClose()
  }

  const del = async () => {
    if (await confirm({ title: 'Delete this record?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true })) {
      remove('transactions', initial.id)
      onClose()
    }
  }

  const accountSelect = (label, val, set, exclude) => (
    <div className="field">
      <label>{label}</label>
      <div className="chips">
        {data.accounts.filter((a) => a.id !== exclude).map((a) => (
          <button type="button" key={a.id} className={`chip ${val === a.id ? 'on' : ''}`} onClick={() => set(a.id)}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.color }} />
            {a.name}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <Modal
      title={editing ? 'Edit record' : 'Add record'}
      onClose={onClose}
      footer={
        <div className="stack" style={{ gap: 10 }}>
          {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
          <div className="row">
            {editing && <button className="btn danger" onClick={del} aria-label="Delete"><Trash2 size={18} /></button>}
            <button className="btn primary block" onClick={save}>{editing ? 'Save changes' : 'Save'}</button>
          </div>
        </div>
      }
    >
      <div className="stack">
        <div className="seg full" role="tablist">
          <button className={type === 'income' ? 'on' : ''} onClick={() => switchType('income')}>Income</button>
          <button className={`exp-on ${type === 'expense' ? 'on' : ''}`} onClick={() => switchType('expense')}>Expense</button>
          <button className={`tr-on ${type === 'transfer' ? 'on' : ''}`} onClick={() => switchType('transfer')}>Transfer</button>
        </div>

        <div className="amount-wrap">
          <span className="cur">{currencySymbol()}</span>
          <input inputMode="decimal" placeholder="0" autoFocus aria-label="Amount" value={amount} style={{ width: `${Math.max(2, amount.length + 1)}ch` }}
            onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setAmount(e.target.value)} />
        </div>

        {budget && (
          <div className={`note-box ${after < 0 ? 'bad' : after < budget.amount * 0.2 ? 'warn' : ''}`}>
            <span>
              Budget left for this category: <b className="num">{money(remaining)}</b> of {money(budget.amount)}
              {value > 0 && <> · after this: <b className="num">{money(after)}</b></>}
            </span>
          </div>
        )}

        {type === 'transfer' ? (
          <>
            {accountSelect('From account', accountId, (id) => { setAccountId(id); if (id === toAccountId) setToAccountId('') })}
            <div className="row" style={{ justifyContent: 'center', color: 'var(--muted)' }}><ArrowRightLeft size={18} /></div>
            {accountSelect('To account', toAccountId, setToAccountId, accountId)}
          </>
        ) : (
          <>
            {accountSelect('Account', accountId, setAccountId)}
            <div className="field">
              <label>Category</label>
              {cats.length ? (
                <div className="cat-grid">
                  {cats.map((c) => (
                    <button type="button" key={c.id} className={`cat-tile ${categoryId === c.id ? 'on' : ''}`} onClick={() => setCategoryId(c.id)}>
                      <span className="e">{c.icon}</span>{c.name}
                    </button>
                  ))}
                </div>
              ) : <p className="muted">No {type} categories yet — add some in Categories.</p>}
            </div>
          </>
        )}

        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="d">Date</label><input id="d" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="t">Time</label><input id="t" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div className="field">
          <label htmlFor="n">Note</label>
          <textarea id="n" className="textarea" rows={2} placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
