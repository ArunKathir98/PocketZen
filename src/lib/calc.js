import { addDays, parseDate, round2, startOfMonth, startOfWeek, toDateStr, endOfMonth } from './util'

export function accountBalance(account, transactions) {
  let b = Number(account.balance) || 0
  for (const t of transactions) {
    if (t.type === 'income' && t.accountId === account.id) b += t.amount
    else if (t.type === 'expense' && t.accountId === account.id) b -= t.amount
    else if (t.type === 'transfer') {
      if (t.accountId === account.id) b -= t.amount
      if (t.toAccountId === account.id) b += t.amount
    }
  }
  return round2(b)
}

/** mode: 'day' | 'week' | 'month' → inclusive [from, to] as YYYY-MM-DD */
export function periodRange(mode, cursor) {
  if (mode === 'day') {
    const s = toDateStr(cursor)
    return { from: s, to: s }
  }
  if (mode === 'week') {
    const s = startOfWeek(cursor)
    return { from: toDateStr(s), to: toDateStr(addDays(s, 6)) }
  }
  return { from: toDateStr(startOfMonth(cursor)), to: toDateStr(endOfMonth(cursor)) }
}

export function shiftCursor(mode, cursor, dir) {
  const d = new Date(cursor)
  if (mode === 'day') d.setDate(d.getDate() + dir)
  else if (mode === 'week') d.setDate(d.getDate() + 7 * dir)
  else {
    d.setDate(1)
    d.setMonth(d.getMonth() + dir)
  }
  return d
}

export function periodLabel(mode, cursor) {
  if (mode === 'day')
    return cursor.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  if (mode === 'week') {
    const s = startOfWeek(cursor)
    const e = addDays(s, 6)
    const f = (d, y) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) })
    return `${f(s)} – ${f(e, true)}`
  }
  return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export const inRange = (t, { from, to }) => t.date >= from && t.date <= to

export function summarize(txs) {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') expense += t.amount
  }
  return { income: round2(income), expense: round2(expense), total: round2(income - expense) }
}

export function monthSpentByCategory(transactions, categoryId, anchorDate, excludeId) {
  const r = periodRange('month', typeof anchorDate === 'string' ? parseDate(anchorDate) : anchorDate)
  let s = 0
  for (const t of transactions) {
    if (t.type === 'expense' && t.categoryId === categoryId && t.id !== excludeId && inRange(t, r)) s += t.amount
  }
  return round2(s)
}

export function groupByDay(txs) {
  const m = new Map()
  for (const t of txs) {
    if (!m.has(t.date)) m.set(t.date, [])
    m.get(t.date).push(t)
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (b.time || '').localeCompare(a.time || '')),
      ...summarize(items),
    }))
}
