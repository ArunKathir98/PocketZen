import { addMonths, round2, todayStr } from './util'

export function emiStats(e) {
  const payments = e.payments || []
  const paidBefore = e.paidBefore || 0
  const paidCount = paidBefore + payments.length
  const paidAmount = round2(paidBefore * e.emiAmount + payments.reduce((s, p) => s + p.amount, 0))
  const pending = Math.max(0, e.totalMonths - paidCount)
  const remaining = Math.max(0, round2(e.totalAmount - paidAmount))
  const done = pending === 0
  const nextDue = done ? null : addMonths(e.startDate, paidCount)
  return {
    paidCount,
    paidAmount,
    pending,
    remaining,
    done,
    nextDue,
    overdue: !!nextDue && nextDue < todayStr(),
    endDate: addMonths(e.startDate, e.totalMonths - 1),
    pct: e.totalMonths ? Math.min(100, (paidCount / e.totalMonths) * 100) : 0,
    // the final instalment settles whatever is left so rounding never leaves a stub
    nextAmount: done ? 0 : pending === 1 && remaining > 0 ? remaining : e.emiAmount,
  }
}

/** Upcoming due dates, starting from the next unpaid instalment. */
export function schedule(e, limit = 6) {
  const { paidCount, pending } = emiStats(e)
  return Array.from({ length: Math.min(limit, pending) }, (_, i) => ({
    n: paidCount + i + 1,
    date: addMonths(e.startDate, paidCount + i),
  }))
}
