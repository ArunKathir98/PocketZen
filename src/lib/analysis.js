// Spending / income analysis: pure functions, no React. Used by pages/Analysis.jsx.
import { addDays, parseDate, round2, toDateStr } from './util'
import { inRange, periodLabel, periodRange } from './calc'

export const MODES = [['week', 'Week'], ['month', 'Month'], ['year', 'Year']]
const MAX_SLICES = 6 // more categories than this are folded into "Other"

export function analysisRange(mode, cursor) {
  if (mode === 'year') return { from: `${cursor.getFullYear()}-01-01`, to: `${cursor.getFullYear()}-12-31` }
  return periodRange(mode, cursor)
}

export function shiftAnalysis(mode, cursor, dir) {
  const d = new Date(cursor)
  if (mode === 'week') d.setDate(d.getDate() + 7 * dir)
  else if (mode === 'year') d.setFullYear(d.getFullYear() + dir, 0, 1)
  else {
    d.setDate(1)
    d.setMonth(d.getMonth() + dir)
  }
  return d
}

export const analysisLabel = (mode, cursor) => (mode === 'year' ? String(cursor.getFullYear()) : periodLabel(mode, cursor))

const sumOf = (txs, type) => round2(txs.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0))

/** Bars for the period: daily for week/month, monthly for year. */
function buildSeries(txs, type, mode, range) {
  const bars = []
  if (mode === 'year') {
    const y = Number(range.from.slice(0, 4))
    for (let m = 0; m < 12; m += 1) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`
      bars.push({ key, label: new Date(y, m, 1).toLocaleDateString(undefined, { month: 'short' }), short: new Date(y, m, 1).toLocaleDateString(undefined, { month: 'narrow' }), value: 0 })
    }
    for (const t of txs) if (t.type === type) bars[Number(t.date.slice(5, 7)) - 1].value += t.amount
  } else {
    const first = parseDate(range.from)
    const n = Math.round((parseDate(range.to) - first) / 86400000) + 1
    const idx = new Map()
    for (let i = 0; i < n; i += 1) {
      const d = addDays(first, i)
      const key = toDateStr(d)
      idx.set(key, i)
      bars.push({ key, label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), short: mode === 'week' ? d.toLocaleDateString(undefined, { weekday: 'narrow' }) : String(d.getDate()), value: 0 })
    }
    for (const t of txs) if (t.type === type && idx.has(t.date)) bars[idx.get(t.date)].value += t.amount
  }
  return bars.map((b) => ({ ...b, value: round2(b.value) }))
}

/**
 * type: 'expense' | 'income'; mode: 'week' | 'month' | 'year'.
 * Returns totals, the previous-period total (for the change %), category slices (top N + "Other"),
 * the bar series and a few headline numbers.
 */
export function analyze(transactions, categories, { type = 'expense', mode = 'month', cursor = new Date(), today = toDateStr(new Date()) } = {}) {
  const range = analysisRange(mode, cursor)
  const txs = transactions.filter((t) => inRange(t, range))
  const ofType = txs.filter((t) => t.type === type)
  const total = round2(ofType.reduce((s, t) => s + t.amount, 0))

  const prevRange = analysisRange(mode, shiftAnalysis(mode, cursor, -1))
  const prevTotal = sumOf(transactions.filter((t) => inRange(t, prevRange)), type)
  const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null

  const catName = new Map(categories.map((c) => [c.id, c]))
  const byId = new Map()
  for (const t of ofType) {
    const e = byId.get(t.categoryId) || { id: t.categoryId, amount: 0, count: 0 }
    e.amount += t.amount
    e.count += 1
    byId.set(t.categoryId, e)
  }
  const all = [...byId.values()]
    .map((e) => {
      const c = catName.get(e.id)
      return { id: e.id, name: c?.name || 'Uncategorized', icon: c?.icon || '🧾', color: c?.color || '#64748b', amount: round2(e.amount), count: e.count }
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))

  let slices = all
  if (all.length > MAX_SLICES) {
    const rest = all.slice(MAX_SLICES - 1)
    slices = [
      ...all.slice(0, MAX_SLICES - 1),
      { id: '__other', name: `Other (${rest.length})`, icon: '➕', color: '#94a3b8', amount: round2(rest.reduce((s, r) => s + r.amount, 0)), count: rest.reduce((s, r) => s + r.count, 0), folded: rest.map((r) => r.id) },
    ]
  }
  slices = slices.map((s) => ({ ...s, pct: total ? (s.amount / total) * 100 : 0 }))

  const series = buildSeries(txs, type, mode, range)
  const active = series.filter((b) => b.value > 0)
  // days (or months) that have already happened, so the average isn't diluted by the future
  const elapsed = Math.max(1, series.filter((b) => (mode === 'year' ? b.key <= today.slice(0, 7) : b.key <= today)).length)
  const peak = active.length ? active.reduce((a, b) => (b.value > a.value ? b : a)) : null
  const biggest = ofType.length ? ofType.reduce((a, b) => (b.amount > a.amount ? b : a)) : null

  return {
    range, type, mode, total, prevTotal, change, slices, series, count: ofType.length,
    avg: round2(total / elapsed), avgUnit: mode === 'year' ? 'month' : 'day',
    peak, biggest, maxBar: series.reduce((m, b) => Math.max(m, b.value), 0),
    empty: ofType.length === 0,
    allCategories: all,
  }
}
