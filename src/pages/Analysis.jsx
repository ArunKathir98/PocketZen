import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../lib/store'
import { MODES, analysisLabel, analyze, shiftAnalysis } from '../lib/analysis'
import { fmtDay, money, toDateStr } from '../lib/util'
import CategoryDetail from '../components/CategoryDetail'
import { Empty } from '../components/ui'

const PREV = { week: 'last week', month: 'last month', year: 'last year' }

/** Donut: one arc per category, 100 = full circle. A small gap between arcs keeps neighbours distinct. */
function Donut({ slices, total, label }) {
  const R = 15.9155
  let offset = 0
  const many = slices.length > 1
  return (
    <svg viewBox="0 0 42 42" className="donut" role="img" aria-label={`${label}: ${money(total)} across ${slices.length} categories`}>
      <circle cx="21" cy="21" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="5.2" />
      {slices.map((s) => {
        const len = Math.max(0.01, s.pct - (many ? 0.9 : 0))
        const el = (
          <circle key={s.id} cx="21" cy="21" r={R} fill="none" stroke={s.color} strokeWidth="5.2"
            strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={25 - offset - (many ? 0.45 : 0)}>
            <title>{`${s.name}: ${money(s.amount)} (${s.pct.toFixed(1)}%)`}</title>
          </circle>
        )
        offset += s.pct
        return el
      })}
    </svg>
  )
}

/** Bar chart of the period. Tap (or hover) a bar to read its value. One hue: the bars show magnitude only. */
function Bars({ series, mode, selected, onSelect, type }) {
  const W = 320
  const top = 10
  const base = 116
  const n = series.length
  const slot = (W - 8) / n
  const bw = Math.min(20, Math.max(3, slot * 0.62))
  const max = Math.max(...series.map((b) => b.value), 0)
  const h = (v) => (max ? Math.max(v > 0 ? 2 : 0, (v / max) * (base - top - 6)) : 0)
  // month view: 1, 5, 10 … and the last day, unless it would sit right next to a label (30 | 31)
  const showTick = (i) => (mode === 'month' ? i === 0 || (i + 1) % 5 === 0 || (i === n - 1 && n % 5 > 2) : true)
  const fill = type === 'income' ? 'var(--income)' : 'var(--brand)'
  return (
    <svg viewBox={`0 0 ${W} 138`} className="bars" role="img" aria-label="Trend over the period">
      <line x1="4" x2={W - 4} y1={base} y2={base} stroke="var(--line)" strokeWidth="1" />
      {max > 0 && <line x1="4" x2={W - 4} y1={top} y2={top} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />}
      {series.map((b, i) => {
        const x = 4 + i * slot + (slot - bw) / 2
        const bh = h(b.value)
        const r = Math.min(3, bw / 2, bh)
        const on = selected === i
        return (
          <g key={b.key} onClick={() => onSelect(on ? null : i)} style={{ cursor: 'pointer' }}>
            <rect x={4 + i * slot} y="0" width={slot} height="130" fill="transparent" />
            {bh > 0 && (
              <path d={`M${x} ${base} V${base - bh + r} Q${x} ${base - bh} ${x + r} ${base - bh} H${x + bw - r} Q${x + bw} ${base - bh} ${x + bw} ${base - bh + r} V${base} Z`}
                fill={fill} opacity={selected == null || on ? 1 : 0.35}>
                <title>{`${b.label}: ${money(b.value)}`}</title>
              </path>
            )}
            {showTick(i) && <text x={x + bw / 2} y="131" textAnchor="middle" fontSize="8.5" fill={on ? 'var(--ink)' : 'var(--muted)'} fontWeight={on ? 800 : 500}>{b.short}</text>}
          </g>
        )
      })}
    </svg>
  )
}

function Tile({ label, value, sub }) {
  return (
    <div className="card pad" style={{ padding: '10px 12px' }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
      <div className="num" style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  )
}

export default function Analysis() {
  const { data } = useApp()
  const [type, setType] = useState('expense')
  const [mode, setMode] = useState('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState(null)

  const a = useMemo(() => analyze(data.transactions, data.categories, { type, mode, cursor, today: toDateStr(new Date()) }), [data.transactions, data.categories, type, mode, cursor])
  const isExp = type === 'expense'
  const label = analysisLabel(mode, cursor)
  const sel = selected != null ? a.series[selected] : null
  const changeBad = a.change != null && (isExp ? a.change > 0 : a.change < 0) // spending more / earning less
  const open = (s) => {
    if (s.folded) return
    const c = data.categories.find((x) => x.id === s.id)
    if (c) setView(c)
  }
  const reset = (fn) => (v) => { setSelected(null); fn(v) }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Analysis</h1><p>Where your money goes</p></div></div>
      <div className="stack">
        <div className="row between wrap">
          <div className="seg" role="tablist">
            <button className={isExp ? 'on' : ''} onClick={() => reset(setType)('expense')}>Expenses</button>
            <button className={!isExp ? 'on' : ''} onClick={() => reset(setType)('income')}>Income</button>
          </div>
          <div className="seg" role="tablist">
            {MODES.map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => reset(setMode)(k)}>{l}</button>)}
          </div>
        </div>
        <div className="stepper" style={{ justifyContent: 'space-between' }}>
          <button className="icon-btn" aria-label="Previous period" onClick={() => reset(setCursor)(shiftAnalysis(mode, cursor, -1))}><ChevronLeft size={18} /></button>
          <button className="lbl btn sm ghost" onClick={() => reset(setCursor)(new Date())} title="Jump to now">{label}</button>
          <button className="icon-btn" aria-label="Next period" onClick={() => reset(setCursor)(shiftAnalysis(mode, cursor, 1))}><ChevronRight size={18} /></button>
        </div>

        <div className="hero">
          <div className="label">{isExp ? 'Total spent' : 'Total earned'} · {label}</div>
          <div className="big num">{money(a.total)}</div>
          <div className="pair">
            <div>
              <span className="l">vs {PREV[mode]}</span>
              <b className="num">
                {a.change == null ? '—' : <>{a.change >= 0 ? <ArrowUpRight size={14} style={{ verticalAlign: '-2px' }} /> : <ArrowDownRight size={14} style={{ verticalAlign: '-2px' }} />} {Math.abs(a.change).toFixed(0)}% {changeBad ? '(worse)' : a.change === 0 ? '' : '(better)'}</>}
              </b>
            </div>
            <div><span className="l">Average per {a.avgUnit}</span><b className="num">{money(a.avg)}</b></div>
          </div>
        </div>

        {a.empty ? (
          <Empty emoji="📊" title={`No ${isExp ? 'expenses' : 'income'} in this period`} text="Add some records, or use the arrows to look at another period." />
        ) : (
          <>
            <div className="card pad">
              <div className="section-title" style={{ margin: '0 0 8px' }}>By category</div>
              <div className="donut-wrap">
                <div className="donut-box">
                  <Donut slices={a.slices} total={a.total} label={label} />
                  <div className="donut-center"><div className="muted" style={{ fontSize: 10.5, fontWeight: 700 }}>{a.slices.length} {a.slices.length === 1 ? 'category' : 'categories'}</div><div className="num" style={{ fontWeight: 800, fontSize: 14 }}>{money(a.total)}</div></div>
                </div>
                <div className="legend">
                  {a.slices.map((s) => (
                    <button key={s.id} className="legend-row" onClick={() => open(s)} disabled={!!s.folded} aria-label={`${s.name}, ${money(s.amount)}, ${s.pct.toFixed(0)} percent`}>
                      <i style={{ background: s.color }} />
                      <span className="lg-name">{s.icon} {s.name}</span>
                      <span className="num lg-amt">{money(s.amount)}</span>
                      <span className="num muted lg-pct">{s.pct.toFixed(s.pct < 10 ? 1 : 0)}%</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>Tap a category to see its records.</p>
            </div>

            <div className="card pad">
              <div className="row between" style={{ marginBottom: 6 }}>
                <div className="section-title" style={{ margin: 0 }}>{mode === 'year' ? 'By month' : 'By day'}</div>
                <div className="num" style={{ fontSize: 12.5, fontWeight: 700, minHeight: 18 }} aria-live="polite">
                  {sel ? <>{sel.label} · <span className={isExp ? 'exp' : 'inc'}>{money(sel.value)}</span></> : <span className="muted">Tap a bar</span>}
                </div>
              </div>
              <Bars series={a.series} mode={mode} selected={selected} onSelect={setSelected} type={type} />
              <div className="muted num" style={{ fontSize: 11, textAlign: 'right' }}>Tallest bar {money(a.maxBar)}</div>
            </div>

            <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Tile label={`Average per ${a.avgUnit}`} value={money(a.avg)} />
              <Tile label="Records" value={a.count} sub={`${a.slices.length} ${a.slices.length === 1 ? 'category' : 'categories'}`} />
              <Tile label={mode === 'year' ? 'Highest month' : 'Highest day'} value={a.peak ? money(a.peak.value) : '—'} sub={a.peak ? (mode === 'year' ? a.peak.label : fmtDay(a.peak.key)) : ''} />
              <Tile label={isExp ? 'Biggest expense' : 'Biggest income'} value={a.biggest ? money(a.biggest.amount) : '—'} sub={a.biggest ? a.biggest.note || data.categories.find((c) => c.id === a.biggest.categoryId)?.name || '' : ''} />
            </div>
          </>
        )}
      </div>
      {view && <CategoryDetail category={view} onClose={() => setView(null)} />}
    </div>
  )
}
