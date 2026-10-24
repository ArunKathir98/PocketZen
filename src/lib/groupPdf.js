// Builds a shareable PDF of a group's summary entirely in the browser.
// Pages are drawn on a canvas (so every language and the currency symbol render correctly) and packed into a PDF.
import logoUrl from '../assets/logo.png'
import { computeBalances, formatGroupId, groupMoney, groupTotal, live, memberName, suggestSettlements } from './groupState'

const W = 794 // A4 at 96dpi
const H = 1123
const M = 44
const S = 2 // render scale
const FONT = "'Segoe UI', system-ui, -apple-system, Roboto, 'Noto Sans', Arial, sans-serif"
const INK = '#0b2b33'
const MUTED = '#5c7780'
const GREEN = '#0b8f68'
const RED = '#d6394f'

const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

class Doc {
  constructor() {
    this.pages = []
    this.newPage()
  }

  newPage() {
    const c = document.createElement('canvas')
    c.width = W * S
    c.height = H * S
    const ctx = c.getContext('2d')
    ctx.scale(S, S)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    this.pages.push({ c, ctx })
    this.ctx = ctx
    this.y = M
  }

  font(size, weight = '400') {
    this.ctx.font = `${weight} ${size}px ${FONT}`
  }

  need(h) {
    if (this.y + h > H - M - 24) this.newPage()
  }

  /** Word-wrap `text` to `maxW`, breaking very long words by character. */
  wrap(text, maxW, size, weight = '400') {
    this.font(size, weight)
    const lines = []
    for (const para of String(text || '').split('\n')) {
      let line = ''
      for (const word of para.split(' ')) {
        let w = word
        while (this.ctx.measureText(w).width > maxW) {
          let cut = w.length - 1
          while (cut > 1 && this.ctx.measureText(w.slice(0, cut)).width > maxW) cut -= 1
          if (line) { lines.push(line); line = '' }
          lines.push(w.slice(0, cut))
          w = w.slice(cut)
        }
        const test = line ? `${line} ${w}` : w
        if (this.ctx.measureText(test).width <= maxW) line = test
        else { lines.push(line); line = w }
      }
      lines.push(line)
    }
    return lines.length ? lines : ['']
  }

  text(str, x, y, { size = 12, weight = '400', color = INK, align = 'left' } = {}) {
    this.font(size, weight)
    this.ctx.fillStyle = color
    this.ctx.textAlign = align
    this.ctx.textBaseline = 'alphabetic'
    this.ctx.fillText(str, x, y)
  }

  heading(title) {
    this.need(46)
    this.y += 14
    this.text(title, M, this.y + 14, { size: 15, weight: '700' })
    this.ctx.fillStyle = '#d8ece9'
    this.ctx.fillRect(M, this.y + 22, W - 2 * M, 1.5)
    this.y += 34
  }

  /** cols: [{ w, align }], head: string[], rows: (string | { t, color, weight })[][] */
  table(cols, head, rows) {
    const total = W - 2 * M
    const sum = cols.reduce((a, c) => a + c.w, 0)
    const widths = cols.map((c) => (c.w / sum) * total)
    const pad = 6
    const lh = 15
    const drawHead = () => {
      this.need(30)
      this.ctx.fillStyle = '#eef8f6'
      this.ctx.fillRect(M, this.y, total, 24)
      let x = M
      head.forEach((h, i) => {
        const al = cols[i].align || 'left'
        this.text(h, al === 'right' ? x + widths[i] - pad : x + pad, this.y + 16, { size: 10.5, weight: '700', color: MUTED, align: al })
        x += widths[i]
      })
      this.y += 24
    }
    drawHead()
    rows.forEach((row, ri) => {
      const cells = row.map((cell, i) => {
        const o = typeof cell === 'object' ? cell : { t: cell }
        return { ...o, lines: this.wrap(o.t, widths[i] - pad * 2, 11.5, o.weight || '400') }
      })
      const h = Math.max(...cells.map((c) => c.lines.length)) * lh + 10
      if (this.y + h > H - M - 24) {
        this.newPage()
        drawHead()
      }
      if (ri % 2) {
        this.ctx.fillStyle = '#f8fcfb'
        this.ctx.fillRect(M, this.y, total, h)
      }
      let x = M
      cells.forEach((c, i) => {
        const al = cols[i].align || 'left'
        c.lines.forEach((ln, li) => this.text(ln, al === 'right' ? x + widths[i] - pad : x + pad, this.y + 17 + li * lh, { size: 11.5, weight: c.weight || '400', color: c.color || INK, align: al }))
        x += widths[i]
      })
      this.y += h
    })
    this.y += 4
  }
}

const dmy = (s) => new Date(s + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

const canvasToJpeg = (c) =>
  new Promise((resolve) => c.toBlob(async (b) => resolve(new Uint8Array(await b.arrayBuffer())), 'image/jpeg', 0.92))

/** Minimal PDF writer: one JPEG image per A4 page. */
export function pdfFromJpegs(pages) {
  const enc = new TextEncoder()
  const chunks = []
  const offsets = []
  let pos = 0
  const push = (u8) => { chunks.push(u8); pos += u8.length }
  const str = (s) => push(enc.encode(s))
  const obj = (n, fn) => { offsets[n] = pos; str(`${n} 0 obj\n`); fn(); str('\nendobj\n') }

  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])) // %PDF-1.4 + binary marker
  const PW = 595.28
  const PH = 841.89
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  obj(1, () => str('<< /Type /Catalog /Pages 2 0 R >>'))
  obj(2, () => str(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`))
  pages.forEach((p, i) => {
    const page = 3 + i * 3
    const img = page + 1
    const content = page + 2
    obj(page, () => str(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`))
    obj(img, () => {
      str(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`)
      push(p.bytes)
      str('\nendstream')
    })
    obj(content, () => {
      const cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`
      str(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`)
    })
  })
  const count = 3 + pages.length * 3
  const xref = pos
  str(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let n = 1; n < count; n += 1) str(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  str(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(chunks, { type: 'application/pdf' })
}

/** The summary PDF: totals, balances, suggested payments, payments made and every expense. */
export async function buildGroupPdf(group) {
  const money = groupMoney(group.currency)
  const doc = new Doc()
  const logo = await loadImage(logoUrl)
  const ctx = doc.ctx

  // header band
  const g = ctx.createLinearGradient(0, 0, W, 130)
  g.addColorStop(0, '#8fe69a')
  g.addColorStop(0.55, '#1ccbb0')
  g.addColorStop(1, '#03a7c3')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, 130)
  if (logo) ctx.drawImage(logo, M, 26, 56 * (logo.width / logo.height), 56)
  doc.text('PocketZen', M + 56 * ((logo?.width || 1) / (logo?.height || 1)) + 14, 52, { size: 24, weight: '800', color: '#04323d' })
  doc.text('Group summary', M + 56 * ((logo?.width || 1) / (logo?.height || 1)) + 14, 74, { size: 13, weight: '600', color: '#04323d' })
  doc.text(group.name, M, 112, { size: 22, weight: '800', color: '#04323d' })
  doc.text(`Group ID ${formatGroupId(group.id)}`, W - M, 52, { size: 11, weight: '700', color: '#04323d', align: 'right' })
  doc.text(`Generated ${dmy(new Date().toISOString().slice(0, 10))}`, W - M, 72, { size: 11, color: '#04323d', align: 'right' })
  doc.text(`Currency ${group.currency}`, W - M, 92, { size: 11, color: '#04323d', align: 'right' })
  doc.y = 156

  const balances = computeBalances(group).sort((a, b) => a.name.localeCompare(b.name))
  const expenses = live(group, 'expenses').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.u - a.u))
  const payments = live(group, 'payments').sort((a, b) => (a.date < b.date ? 1 : -1))
  const plan = suggestSettlements(balances)

  // totals
  const stats = [
    ['Total spent', money(groupTotal(group))],
    ['Expenses', String(expenses.length)],
    ['People', String(balances.length)],
    ['Payments recorded', String(payments.length)],
  ]
  const bw = (W - 2 * M - 3 * 12) / 4
  stats.forEach(([k, v], i) => {
    const x = M + i * (bw + 12)
    ctx.fillStyle = '#eef8f6'
    ctx.beginPath()
    ctx.roundRect(x, doc.y, bw, 58, 12)
    ctx.fill()
    doc.text(k, x + 12, doc.y + 22, { size: 10.5, weight: '700', color: MUTED })
    doc.text(v, x + 12, doc.y + 45, { size: 16, weight: '800' })
  })
  doc.y += 70

  doc.heading('Balances')
  doc.table(
    [{ w: 3 }, { w: 2, align: 'right' }, { w: 2, align: 'right' }, { w: 2.4, align: 'right' }],
    ['Person', 'Paid', 'Share', 'Balance'],
    balances.map((b) => [
      { t: b.name, weight: '600' },
      money(b.paid),
      money(b.share),
      { t: b.net === 0 ? 'Settled' : b.net > 0 ? `Gets ${money(b.net)}` : `Owes ${money(-b.net)}`, color: b.net > 0 ? GREEN : b.net < 0 ? RED : MUTED, weight: '700' },
    ]),
  )

  doc.heading('Suggested payments to settle up')
  if (!plan.length) doc.table([{ w: 1 }], ['Status'], [[{ t: 'Everyone is settled up. Nothing to pay.', color: GREEN, weight: '700' }]])
  else
    doc.table(
      [{ w: 1 }, { w: 3.4 }, { w: 2, align: 'right' }],
      ['#', 'Payment', 'Amount'],
      plan.map((t, i) => [String(i + 1), { t: `${memberName(group, t.from)}  →  ${memberName(group, t.to)}`, weight: '600' }, { t: money(t.amount), weight: '700' }]),
    )

  if (payments.length) {
    doc.heading('Payments recorded')
    doc.table(
      [{ w: 2 }, { w: 4 }, { w: 2, align: 'right' }, { w: 3 }],
      ['Date', 'From → To', 'Amount', 'Note'],
      payments.map((p) => [dmy(p.date), `${memberName(group, p.from)}  →  ${memberName(group, p.to)}`, money(Math.round(p.amount * 100)), p.settle ? `Settle up${p.note ? ` · ${p.note}` : ''}` : p.note || '']),
    )
  }

  doc.heading('Expenses')
  if (!expenses.length) doc.table([{ w: 1 }], ['Status'], [['No expenses yet.']])
  else
    doc.table(
      [{ w: 1.9 }, { w: 3.1 }, { w: 2 }, { w: 2, align: 'right' }, { w: 3.4 }],
      ['Date', 'Expense', 'Paid by', 'Amount', 'Split between'],
      expenses.map((e) => [
        dmy(e.date),
        { t: `${e.title}${e.eventId && group.events[e.eventId] && !group.events[e.eventId].deleted ? `\n${group.events[e.eventId].name}` : ''}`, weight: '600' },
        memberName(group, e.paidBy),
        { t: money(Math.round(e.amount * 100)), weight: '700' },
        e.split.length === balances.length ? 'Everyone' : e.split.map((id) => memberName(group, id)).join(', '),
      ]),
    )

  // footers
  doc.pages.forEach(({ ctx: c }, i) => {
    c.fillStyle = MUTED
    c.font = `500 10px ${FONT}`
    c.textAlign = 'left'
    c.fillText('PocketZen · Your Money. Your Control.', M, H - 26)
    c.textAlign = 'right'
    c.fillText(`Page ${i + 1} of ${doc.pages.length}`, W - M, H - 26)
  })

  const jpegs = await Promise.all(doc.pages.map(async ({ c }) => ({ bytes: await canvasToJpeg(c), w: c.width, h: c.height })))
  return pdfFromJpegs(jpegs)
}

/** Share the PDF through the phone's share sheet, or fall back to a normal download. */
export async function shareOrDownloadPdf(blob, filename, { share = true } = {}) {
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
