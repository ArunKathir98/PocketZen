export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

const pad = (n) => String(n).padStart(2, '0')

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const toTimeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const todayStr = () => toDateStr(new Date())
export const nowTimeStr = () => toTimeStr(new Date())
export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
export const addMonths = (dateStr, n) => {
  const base = parseDate(dateStr)
  const d = new Date(base.getFullYear(), base.getMonth() + n, 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(base.getDate(), last))
  return toDateStr(d)
}
export const startOfWeek = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = (x.getDay() + 6) % 7 // Monday first
  x.setDate(x.getDate() - diff)
  return x
}
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
export const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0)

export const fmtDay = (s) => {
  const d = parseDate(s)
  const t = todayStr()
  if (s === t) return 'Today'
  if (s === toDateStr(addDays(new Date(), -1))) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
export const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
export const fmtDateTime = (d) =>
  d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

let _cur = 'INR'
let _nf = null
export const setCurrency = (c) => {
  _cur = c
  _nf = null
}
export const money = (n, opts = {}) => {
  if (!_nf) {
    _nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: _cur, maximumFractionDigits: 2 })
  }
  const v = _nf.format(Math.abs(n || 0))
  if (opts.sign) return (n < 0 ? '−' : n > 0 ? '+' : '') + v
  return (n < 0 ? '−' : '') + v
}
export const currencySymbol = () =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: _cur })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value || _cur

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

export const download = (filename, text, mime = 'application/json') => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
