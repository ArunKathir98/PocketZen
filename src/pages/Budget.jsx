import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { inRange, periodLabel, periodRange, shiftCursor } from '../lib/calc'
import { currencySymbol, money, round2 } from '../lib/util'
import { Empty, Modal } from '../components/ui'
import { useDialog } from '../components/dialog'
import CategoryDetail from '../components/CategoryDetail'

export default function Budget() {
  const { data, remove } = useApp()
  const [cursor, setCursor] = useState(() => new Date())
  const { confirm } = useDialog()
  const [edit, setEdit] = useState(null)
  const [view, setView] = useState(null)
  const range = periodRange('month', cursor)

  const rows = useMemo(() => {
    return data.budgets
      .map((b) => {
        const c = data.categories.find((x) => x.id === b.categoryId)
        if (!c) return null
        const spent = round2(data.transactions.filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && inRange(t, range)).reduce((s, t) => s + t.amount, 0))
        return { b, c, spent, left: round2(b.amount - spent), pct: b.amount ? Math.min(100, (spent / b.amount) * 100) : 0 }
      })
      .filter(Boolean)
  }, [data, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalBudget = rows.reduce((s, r) => s + r.b.amount, 0)
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0)

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Budget</h1><p>Monthly limits per expense category</p></div>
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={18} /> Set</button>
      </div>
      <div className="stack">
        <div className="row between wrap">
          <div className="stepper">
            <button className="icon-btn" aria-label="Previous month" onClick={() => setCursor(shiftCursor('month', cursor, -1))}><ChevronLeft size={18} /></button>
            <span className="lbl">{periodLabel('month', cursor)}</span>
            <button className="icon-btn" aria-label="Next month" onClick={() => setCursor(shiftCursor('month', cursor, 1))}><ChevronRight size={18} /></button>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="hero">
            <div className="label">Spent of budget</div>
            <div className="big num" style={{ marginBottom: 12 }}>{money(totalSpent)} <span style={{ fontSize: '.5em', opacity: .7 }}>/ {money(totalBudget)}</span></div>
            <div className="bar" style={{ background: 'rgba(255,255,255,.4)', position: 'relative', zIndex: 1 }}>
              <i style={{ width: `${totalBudget ? Math.min(100, (totalSpent / totalBudget) * 100) : 0}%`, background: 'var(--brand-ink)' }} />
            </div>
          </div>
        )}
        {rows.length === 0 ? (
          <Empty emoji="🎯" title="No budgets yet" text="Set a monthly limit for an expense category and track what's left." action={<button className="btn primary" onClick={() => setEdit({})}>Set a budget</button>} />
        ) : (
          <div className="grid-auto">
            {rows.map(({ b, c, spent, left, pct }) => (
              <div className="card pad" key={b.id}>
                <div className="row">
                  <button className="row" style={{ flex: 1, minWidth: 0, textAlign: 'left' }} onClick={() => setView(c)} aria-label={`${c.name} expenses`}>
                  <span className="ico" style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 19, background: `${c.color}26` }}>{c.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{c.name}</div>
                    <div className="muted num" style={{ fontSize: 12.5 }}>{money(spent)} of {money(b.amount)}</div>
                  </div>
                  </button>
                  <button className="icon-btn" aria-label={`Edit ${c.name} budget`} onClick={() => setEdit(b)}><Pencil size={16} /></button>
                  <button className="icon-btn danger" aria-label={`Remove ${c.name} budget`} onClick={async () => (await confirm({ title: `Remove ${c.name} budget?`, message: 'Your records are not affected.', confirmText: 'Remove', danger: true })) && remove('budgets', b.id)}><Trash2 size={16} /></button>
                </div>
                <div className={`bar ${pct >= 100 ? 'over' : pct >= 80 ? 'warn' : ''}`} style={{ margin: '10px 0 6px' }}><i style={{ width: `${pct}%` }} /></div>
                <div className="row between" style={{ fontSize: 12, fontWeight: 700 }}>
                  <span className={left < 0 ? 'exp' : ''}>{left < 0 ? `Over by ${money(-left)}` : `${money(left)} left`}</span>
                  <span className="muted">{Math.round(pct)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {view && <CategoryDetail category={view} onClose={() => setView(null)} />}
      {edit && <BudgetForm budget={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function BudgetForm({ budget, onClose }) {
  const { data, add, update } = useApp()
  const editing = !!budget.id
  const taken = new Set(data.budgets.map((b) => b.categoryId))
  const options = data.categories.filter((c) => c.type === 'expense' && (editing ? c.id === budget.categoryId : !taken.has(c.id)))
  const [categoryId, setCategoryId] = useState(budget.categoryId || options[0]?.id || '')
  const [amount, setAmount] = useState(budget.amount ? String(budget.amount) : '')
  const v = parseFloat(amount) || 0

  const save = () => {
    if (!categoryId || !(v > 0)) return
    editing ? update('budgets', budget.id, { amount: v }) : add('budgets', { categoryId, amount: v, period: 'monthly' })
    onClose()
  }
  return (
    <Modal title={editing ? 'Edit budget' : 'Set budget'} onClose={onClose}
      footer={<button className="btn primary block" disabled={!categoryId || !(v > 0)} onClick={save}>Save</button>}>
      <div className="stack">
        {options.length === 0 ? <p className="muted">Every expense category already has a budget.</p> : (
          <>
            <div className="field"><label>Category</label>
              <div className="cat-grid">
                {options.map((c) => (
                  <button key={c.id} type="button" disabled={editing} className={`cat-tile ${categoryId === c.id ? 'on' : ''}`} onClick={() => setCategoryId(c.id)}>
                    <span className="e">{c.icon}</span>{c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="field"><label htmlFor="ba">Monthly budget ({currencySymbol()})</label>
              <input id="ba" className="input num" inputMode="decimal" autoFocus value={amount} placeholder="0" onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setAmount(e.target.value)} />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
