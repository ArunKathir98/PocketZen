// Loan engine for money lent to / borrowed from people.
//
// A loan is a list of dated events:
//   { kind: 'principal', amount }                      money given / taken (the first one is the opening amount)
//   { kind: 'payment',   amount, principalPart, interestPart }   money paid back, split between principal and interest
//   { kind: 'interest',  amount }                      a manual interest charge
//   { kind: 'terms',     rate?, amount? }              interest terms change from that date
//
// Interest types (loan.interest.type):
//   none      – no interest
//   fixed     – a fixed amount every month (interest.amount) on each monthly anniversary, while principal is outstanding
//   simple    – rate % per month or year (interest.rate / interest.period) on the outstanding principal
//   compound  – like simple, but unpaid interest also earns interest (monthly compounding)
//   manual    – nothing accrues automatically; you add interest charges yourself
import { addMonths, parseDate, round2, todayStr } from './util'

const EPS = 0.005

const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000)

/** Whole calendar months from a to b (both 'YYYY-MM-DD', b >= a). */
export function wholeMonths(a, b) {
  const da = parseDate(a)
  const db = parseDate(b)
  let m = (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth())
  while (m > 0 && addMonths(a, m) > b) m -= 1
  return Math.max(0, m)
}

export const INTEREST_TYPES = [
  { id: 'none', label: 'None' },
  { id: 'fixed', label: 'Fixed / month' },
  { id: 'simple', label: 'Simple %' },
  { id: 'compound', label: 'Compound %' },
  { id: 'manual', label: 'Manual' },
]

export const hasMonthlyCycle = (loan) => ['fixed', 'simple', 'compound'].includes(loan.interest?.type)

export function loanStats(loan, asOf = todayStr()) {
  const it = loan.interest || { type: 'none' }
  const start = loan.startDate
  const timeline = (loan.events || [])
    .map((e, i) => ({ ...e, _i: i }))
    .filter((e) => e.date <= asOf)
    .sort((a, b) => (a.date === b.date ? a._i - b._i : a.date < b.date ? -1 : 1))

  const st = { P: 0, U: 0, principalIn: 0, principalPaid: 0, interestAccrued: 0, interestPaid: 0, rate: Number(it.rate) || 0, fixed: Number(it.amount) || 0, cursor: start, monthsFixed: 0 }
  const monthlyRate = () => (it.period === 'year' ? st.rate / 100 / 12 : st.rate / 100)

  const advance = (to) => {
    if (it.type === 'fixed') {
      for (;;) {
        const nd = addMonths(start, st.monthsFixed + 1)
        if (nd > to) break
        if (st.P > EPS) {
          st.U += st.fixed
          st.interestAccrued += st.fixed
        }
        st.monthsFixed += 1
      }
      if (to > st.cursor) st.cursor = to
      return
    }
    if ((it.type === 'simple' || it.type === 'compound') && to > st.cursor && st.P > EPS) {
      const w = wholeMonths(st.cursor, to)
      const frac = Math.min(1, daysBetween(addMonths(st.cursor, w), to) / 30)
      const mr = monthlyRate()
      let add = 0
      if (it.type === 'simple') add = st.P * mr * (w + frac)
      else {
        let u = st.U
        for (let i = 0; i < w; i += 1) {
          const x = (st.P + u) * mr
          u += x
          add += x
        }
        add += (st.P + u) * mr * frac
      }
      st.U += add
      st.interestAccrued += add
    }
    if (to > st.cursor) st.cursor = to
  }

  for (const e of timeline) {
    advance(e.date)
    const a = Number(e.amount) || 0
    if (e.kind === 'principal') {
      st.P += a
      st.principalIn += a
    } else if (e.kind === 'payment') {
      const ip = Number(e.interestPart ?? 0)
      const pp = Number(e.principalPart ?? a - ip)
      st.P -= pp
      st.principalPaid += pp
      st.U -= ip
      st.interestPaid += ip
    } else if (e.kind === 'interest') {
      st.U += a
      st.interestAccrued += a
    } else if (e.kind === 'terms') {
      if (e.rate != null && e.rate !== '') st.rate = Number(e.rate)
      if (e.amount != null && e.amount !== '') st.fixed = Number(e.amount)
    }
  }
  advance(asOf)

  const principalBalance = round2(Math.max(0, st.P))
  const interestDue = round2(st.U)
  const outstanding = round2(principalBalance + Math.max(0, interestDue))
  const settled = st.principalIn > 0 && st.P <= EPS && st.U <= EPS
  return {
    principalIn: round2(st.principalIn),
    principalPaid: round2(st.principalPaid),
    principalBalance,
    interestAccrued: round2(st.interestAccrued),
    interestPaid: round2(st.interestPaid),
    interestDue,
    outstanding,
    settled,
    pct: st.principalIn ? Math.min(100, (Math.max(0, st.principalPaid) / st.principalIn) * 100) : 0,
    nextInterestOn: hasMonthlyCycle(loan) && st.P > EPS ? addMonths(start, wholeMonths(start, asOf) + 1) : null,
    rate: st.rate,
    fixed: st.fixed,
  }
}

/** Interest first, then principal – the usual way informal loans are settled. */
export function suggestSplit(stats, amount) {
  const interestPart = round2(Math.min(Math.max(stats.interestDue, 0), amount))
  return { interestPart, principalPart: round2(amount - interestPart) }
}

/** Totals for one person across all their loans. */
export function personSummary(person, loans, asOf = todayStr()) {
  let receive = 0
  let pay = 0
  let interestDueToReceive = 0
  let active = 0
  for (const l of loans.filter((x) => x.personId === person.id)) {
    const s = loanStats(l, asOf)
    if (s.settled) continue
    active += 1
    if (l.direction === 'lent') {
      receive += s.outstanding
      interestDueToReceive += Math.max(0, s.interestDue)
    } else pay += s.outstanding
  }
  return { receive: round2(receive), pay: round2(pay), net: round2(receive - pay), interestDueToReceive: round2(interestDueToReceive), active }
}

export const loanLabel = (loan) => loan.title || (loan.direction === 'lent' ? 'Money lent' : 'Money borrowed')

export function interestSummary(loan) {
  const it = loan.interest || { type: 'none' }
  if (it.type === 'fixed') return `${it.amount} / month`
  if (it.type === 'simple' || it.type === 'compound') return `${it.rate}% per ${it.period === 'year' ? 'year' : 'month'}${it.type === 'compound' ? ' (compound)' : ''}`
  if (it.type === 'manual') return 'Manual interest'
  return 'No interest'
}

/** Plain-text statement to send to the other person. */
export function buildStatement(person, loans, fmt, asOf = todayStr()) {
  const mine = loans.filter((l) => l.personId === person.id)
  const lines = [`*PocketZen statement — ${person.name}*`, `As of ${asOf}`, '']
  for (const l of mine) {
    const s = loanStats(l, asOf)
    lines.push(`*${loanLabel(l)}* (${l.direction === 'lent' ? 'given to you' : 'taken from you'}, started ${l.startDate})`)
    lines.push(`• Amount: ${fmt(s.principalIn)}`)
    lines.push(`• Principal paid: ${fmt(s.principalPaid)} · Balance: ${fmt(s.principalBalance)}`)
    if (l.interest?.type && l.interest.type !== 'none') {
      lines.push(`• Interest (${interestSummary(l)}): charged ${fmt(s.interestAccrued)}, paid ${fmt(s.interestPaid)}, due ${fmt(Math.max(0, s.interestDue))}`)
    }
    lines.push(`• ${s.settled ? 'Settled ✅' : `Total to settle: ${fmt(s.outstanding)}`}`)
    const pays = (l.events || []).filter((e) => e.kind === 'payment').sort((a, b) => (a.date < b.date ? -1 : 1))
    if (pays.length) {
      lines.push('  Payments:')
      for (const p of pays) lines.push(`  - ${p.date}: ${fmt(p.amount)}${p.interestPart ? ` (interest ${fmt(p.interestPart)})` : ''}`)
    }
    lines.push('')
  }
  const sum = personSummary(person, loans, asOf)
  lines.push(sum.net >= 0 ? `*Total ${person.name} owes: ${fmt(sum.net)}*` : `*Total owed to ${person.name}: ${fmt(-sum.net)}*`)
  return lines.join('\n')
}
