import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { ACCOUNT_TYPES, COLORS } from '../lib/defaults'
import { accountBalance } from '../lib/calc'
import { currencySymbol, money, round2 } from '../lib/util'
import { Empty, Modal } from '../components/ui'

export default function Accounts() {
  const { data, remove } = useApp()
  const [edit, setEdit] = useState(null)
  const rows = useMemo(
    () => data.accounts.map((a) => ({ ...a, current: accountBalance(a, data.transactions) })),
    [data.accounts, data.transactions],
  )
  const total = round2(rows.reduce((s, a) => s + a.current, 0))
  const typeOf = (id) => ACCOUNT_TYPES.find((t) => t.id === id) || ACCOUNT_TYPES[5]

  const del = (a) => {
    const used = data.transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id)
    if (used) return alert(`"${a.name}" has records. Delete or move those records first.`)
    if (confirm(`Delete "${a.name}"?`)) remove('accounts', a.id)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Accounts</h1><p>Banks, wallets, cash & investments</p></div>
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={18} /> Add</button>
      </div>
      <div className="stack">
        <div className="hero">
          <div className="label">Net balance</div>
          <div className="big num" style={{ marginBottom: 0 }}>{money(total)}</div>
        </div>
        {rows.length === 0 ? (
          <Empty emoji="🏦" title="No accounts" text="Add a bank account, wallet or cash to get started." action={<button className="btn primary" onClick={() => setEdit({})}>Add account</button>} />
        ) : (
          <div className="grid-auto">
            {rows.map((a) => (
              <div className="card pad" key={a.id} style={{ borderTop: `4px solid ${a.color}` }}>
                <div className="row">
                  <span className="ico" style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 19, background: `${a.color}26` }}>{typeOf(a.type).emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{a.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{typeOf(a.type).label}{a.note ? ` · ${a.note}` : ''}</div>
                  </div>
                  <button className="icon-btn" aria-label={`Edit ${a.name}`} onClick={() => setEdit(a)}><Pencil size={15} /></button>
                  <button className="icon-btn danger" aria-label={`Delete ${a.name}`} onClick={() => del(a)}><Trash2 size={15} /></button>
                </div>
                <div className="num" style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 10, color: a.current < 0 ? 'var(--expense)' : undefined }}>{money(a.current)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {edit && <AccountForm acc={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function AccountForm({ acc, onClose }) {
  const { add, update } = useApp()
  const editing = !!acc.id
  const [name, setName] = useState(acc.name || '')
  const [type, setType] = useState(acc.type || 'savings')
  const [balance, setBalance] = useState(acc.balance !== undefined ? String(acc.balance) : '')
  const [note, setNote] = useState(acc.note || '')
  const [color, setColor] = useState(acc.color || COLORS[1])

  const save = () => {
    if (!name.trim()) return
    const v = { name: name.trim(), type, balance: parseFloat(balance) || 0, note: note.trim(), color }
    editing ? update('accounts', acc.id, v) : add('accounts', v)
    onClose()
  }
  return (
    <Modal title={editing ? 'Edit account' : 'New account'} onClose={onClose}
      footer={<button className="btn primary block" disabled={!name.trim()} onClick={save}>Save</button>}>
      <div className="stack">
        <div className="field"><label htmlFor="an">Account name</label><input id="an" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Savings" /></div>
        <div className="field"><label>Type</label>
          <div className="chips">{ACCOUNT_TYPES.map((t) => <button key={t.id} type="button" className={`chip ${type === t.id ? 'on' : ''}`} onClick={() => setType(t.id)}>{t.emoji} {t.label}</button>)}</div>
        </div>
        <div className="field"><label htmlFor="ab">Opening balance ({currencySymbol()})</label>
          <input id="ab" className="input num" inputMode="decimal" value={balance} placeholder="0" onChange={(e) => /^-?\d*\.?\d{0,2}$/.test(e.target.value) && setBalance(e.target.value)} />
        </div>
        <div className="field"><label htmlFor="ad">Details (optional)</label><input id="ad" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bank, last 4 digits…" /></div>
        <div className="field"><label>Colour</label>
          <div className="swatches">{COLORS.map((c) => <button key={c} type="button" aria-label={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
        </div>
      </div>
    </Modal>
  )
}
