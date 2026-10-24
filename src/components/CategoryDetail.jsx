import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../lib/store'
import { groupByDay, inRange, periodLabel, periodRange, shiftCursor } from '../lib/calc'
import { fmtDay, fmtTime, money, round2 } from '../lib/util'
import AddSheet from './AddSheet'
import { Modal } from './ui'

const MODES = [['month', 'Monthly'], ['week', 'Weekly'], ['day', 'Daily'], ['all', 'All']]

/** Every transaction of one category, with a period filter and budget progress. */
export default function CategoryDetail({ category, onClose }) {
  const { data } = useApp()
  const [mode, setMode] = useState('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [edit, setEdit] = useState(null)

  const isExp = category.type === 'expense'
  const range = useMemo(() => (mode === 'all' ? null : periodRange(mode, cursor)), [mode, cursor])
  const txs = useMemo(
    () => data.transactions.filter((t) => t.categoryId === category.id && t.type === category.type && (!range || inRange(t, range))),
    [data.transactions, category, range],
  )
  const total = round2(txs.reduce((s, t) => s + t.amount, 0))
  const groups = useMemo(() => groupByDay(txs), [txs])
  const budget = isExp ? data.budgets.find((b) => b.categoryId === category.id) : null
  const acc = (id) => data.accounts.find((a) => a.id === id)

  return (
    <Modal title={`${category.icon} ${category.name}`} onClose={onClose}>
      <div className="stack">
        <div className="seg full">
          {MODES.map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
        </div>
        {mode !== 'all' && (
          <div className="stepper" style={{ justifyContent: 'space-between' }}>
            <button className="icon-btn" aria-label="Previous" onClick={() => setCursor(shiftCursor(mode, cursor, -1))}><ChevronLeft size={18} /></button>
            <button className="lbl btn sm ghost" onClick={() => setCursor(new Date())}>{periodLabel(mode, cursor)}</button>
            <button className="icon-btn" aria-label="Next" onClick={() => setCursor(shiftCursor(mode, cursor, 1))}><ChevronRight size={18} /></button>
          </div>
        )}

        <div className="card pad" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
          <div className="row between">
            <div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{isExp ? 'TOTAL SPENT' : 'TOTAL RECEIVED'}</div>
              <div className={`num ${isExp ? 'exp' : 'inc'}`} style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>{money(total)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>RECORDS</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 800 }}>{txs.length}</div>
            </div>
          </div>
          {budget && mode === 'month' && (() => {
            const pct = budget.amount ? Math.min(100, (total / budget.amount) * 100) : 0
            const left = round2(budget.amount - total)
            return (
              <div style={{ marginTop: 12 }}>
                <div className={`bar ${pct >= 100 ? 'over' : pct >= 80 ? 'warn' : ''}`}><i style={{ width: `${pct}%` }} /></div>
                <div className="row between" style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>
                  <span className={left < 0 ? 'exp' : ''}>{left < 0 ? `Over budget by ${money(-left)}` : `${money(left)} left`}</span>
                  <span className="muted">Budget {money(budget.amount)}</span>
                </div>
              </div>
            )
          })()}
        </div>

        {groups.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center', padding: '18px 0' }}>No {isExp ? 'expenses' : 'income'} in this {mode === 'all' ? 'category yet' : 'period'}.</p>
        ) : (
          groups.map((g) => (
            <section key={g.date}>
              <div className="day-head"><span>{fmtDay(g.date)}</span><span className={`num ${isExp ? 'exp' : 'inc'}`}>{money(isExp ? g.expense : g.income)}</span></div>
              <div className="card list">
                {g.items.map((t) => (
                  <button className="item" key={t.id} onClick={() => setEdit(t)}>
                    <span className="main">
                      <div className="t">{t.note || category.name}</div>
                      <div className="s">{[acc(t.accountId)?.name || 'Deleted account', fmtTime(t.time)].filter(Boolean).join(' · ')}</div>
                    </span>
                    <span className={`amt ${isExp ? 'exp' : 'inc'}`}>{isExp ? '−' : '+'}{money(t.amount)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      {edit && <AddSheet initial={edit} onClose={() => setEdit(null)} />}
    </Modal>
  )
}
