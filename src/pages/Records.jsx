import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useApp } from '../lib/store'
import { groupByDay, inRange, periodLabel, periodRange, shiftCursor, summarize } from '../lib/calc'
import { fmtDay, fmtTime, money, toDateStr } from '../lib/util'
import AddSheet from '../components/AddSheet'
import { Empty } from '../components/ui'

const MODES = [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]

export default function Records() {
  const { data } = useApp()
  const [mode, setMode] = useState('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [sheet, setSheet] = useState(null) // null | {} | tx

  const range = useMemo(() => periodRange(mode, cursor), [mode, cursor])
  const txs = useMemo(() => data.transactions.filter((t) => inRange(t, range)), [data.transactions, range])
  const sum = useMemo(() => summarize(txs), [txs])
  const groups = useMemo(() => groupByDay(txs), [txs])

  const cat = (id) => data.categories.find((c) => c.id === id)
  const acc = (id) => data.accounts.find((a) => a.id === id)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Records</h1>
          <p>Your money, at a glance</p>
        </div>
      </div>

      <div className="stack">
        <div className="hero">
          <div className="label">Total · {periodLabel(mode, cursor)}</div>
          <div className="big num">{money(sum.total, { sign: sum.total !== 0 })}</div>
          <div className="pair">
            <div><span className="l"><ArrowUpRight size={14} /> Expense</span><b className="num">{money(sum.expense)}</b></div>
            <div><span className="l"><ArrowDownLeft size={14} /> Income</span><b className="num">{money(sum.income)}</b></div>
          </div>
        </div>

        <div className="row between wrap">
          <div className="seg" role="tablist">
            {MODES.map(([k, l]) => (
              <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
          <div className="stepper">
            <button className="icon-btn" aria-label="Previous" onClick={() => setCursor(shiftCursor(mode, cursor, -1))}><ChevronLeft size={18} /></button>
            <button className="lbl btn sm ghost" onClick={() => setCursor(new Date())} title="Jump to today">{periodLabel(mode, cursor)}</button>
            <button className="icon-btn" aria-label="Next" onClick={() => setCursor(shiftCursor(mode, cursor, 1))}><ChevronRight size={18} /></button>
          </div>
        </div>

        {groups.length === 0 ? (
          <Empty emoji="🧾" title="No records yet" text="Tap the + button to add an income, expense or transfer."
            action={<button className="btn primary" onClick={() => setSheet({})}><Plus size={18} /> Add record</button>} />
        ) : (
          groups.map((g) => (
            <section className="day-group" key={g.date}>
              <div className="day-head">
                <span>{fmtDay(g.date)}</span>
                <span className="num">
                  {g.income > 0 && <span className="inc">{money(g.income, { sign: true })} </span>}
                  {g.expense > 0 && <span className="exp">{money(-g.expense)}</span>}
                </span>
              </div>
              <div className="card list">
                {g.items.map((t) => {
                  const c = cat(t.categoryId)
                  const isTr = t.type === 'transfer'
                  const title = isTr ? 'Transfer' : c?.name || 'Uncategorized'
                  const sub = isTr
                    ? `${acc(t.accountId)?.name || '—'} → ${acc(t.toAccountId)?.name || '—'}`
                    : acc(t.accountId)?.name || 'Deleted account'
                  return (
                    <button className="item" key={t.id} onClick={() => setSheet(t)}>
                      <span className="ico" style={{ background: `${isTr ? '#5b7cff' : c?.color || '#64748b'}22` }}>
                        {isTr ? '🔁' : c?.icon || '🧾'}
                      </span>
                      <span className="main">
                        <div className="t">{title}</div>
                        <div className="s">{[sub, t.note, fmtTime(t.time)].filter(Boolean).join(' · ')}</div>
                      </span>
                      <span className={`amt ${t.type === 'income' ? 'inc' : t.type === 'expense' ? 'exp' : 'tr-col'}`}>
                        {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <button className="fab" aria-label="Add record" onClick={() => setSheet({})}><Plus /></button>
      {sheet && <AddSheet initial={sheet.id ? sheet : null} defaultDate={mode === 'day' ? toDateStr(cursor) : undefined} onClose={() => setSheet(null)} />}
    </div>
  )
}
