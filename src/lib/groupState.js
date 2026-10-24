// Shared-group logic with no browser or server dependencies – used by the app AND the Cloudflare Worker.
//
// Group state (server is the source of truth):
//   { id, name, currency, createdAt, updatedAt, version,
//     members:  { [id]: { id, name, email, deleted, u } },
//     events:   { [id]: { id, name, deleted, u } },
//     expenses: { [id]: { id, title, amount, paidBy, split: [memberId], eventId, date, note, deleted, u } },
//     payments: { [id]: { id, from, to, amount, date, note, deleted, u } } }
// Every entity carries `u` (last-updated ms). Edits are idempotent "set entity" operations resolved
// last-write-wins per entity, so two people editing at once never overwrite each other's other changes.

export const LIMITS = { members: 60, events: 50, expenses: 3000, payments: 3000, entityBytes: 2000, stateBytes: 1_000_000 }
export const GROUP_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const COLLECTIONS = ['members', 'events', 'expenses', 'payments']

const str = (v, max) => String(v ?? '').slice(0, max)
const idOk = (v) => typeof v === 'string' && /^[\w-]{1,40}$/.test(v)
const amountOk = (n) => Number.isFinite(n) && n >= 0 && n <= 1e9
const dateOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export const normalizeGroupId = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const isGroupId = (s) => new RegExp(`^[${GROUP_ID_ALPHABET}]{12}$`).test(normalizeGroupId(s))
export const formatGroupId = (s) => normalizeGroupId(s).replace(/(.{4})(?=.)/g, '$1-')

export const emptyGroup = (id, name, currency, now) => ({
  id, name: str(name, 80) || 'Group', currency: str(currency, 6) || 'INR', createdAt: now, updatedAt: now, version: 1,
  members: {}, events: {}, expenses: {}, payments: {},
})

/** Whitelist + validate one entity. Returns null when it is not acceptable. */
export function cleanEntity(coll, id, v, now) {
  if (!idOk(id) || !v || typeof v !== 'object') return null
  const u = Number.isFinite(v.u) ? Math.min(v.u, now + 60_000) : now
  const base = { id, deleted: !!v.deleted, u }
  let e
  if (coll === 'members') {
    const name = str(v.name, 60).trim()
    if (!name && !base.deleted) return null
    e = { ...base, name, email: str(v.email, 120).trim() }
  } else if (coll === 'events') {
    const name = str(v.name, 60).trim()
    if (!name && !base.deleted) return null
    e = { ...base, name }
  } else if (coll === 'expenses') {
    const amount = Number(v.amount)
    if (!base.deleted && (!amountOk(amount) || amount <= 0 || !idOk(v.paidBy) || !Array.isArray(v.split) || !v.split.length || !v.split.every(idOk) || !dateOk(v.date))) return null
    e = { ...base, title: str(v.title, 80).trim() || 'Expense', amount: Number.isFinite(amount) ? amount : 0, paidBy: str(v.paidBy, 40), split: (v.split || []).slice(0, LIMITS.members).map((x) => str(x, 40)), eventId: v.eventId && idOk(v.eventId) ? v.eventId : '', date: dateOk(v.date) ? v.date : '1970-01-01', note: str(v.note, 200) }
  } else if (coll === 'payments') {
    const amount = Number(v.amount)
    if (!base.deleted && (!amountOk(amount) || amount <= 0 || !idOk(v.from) || !idOk(v.to) || v.from === v.to || !dateOk(v.date))) return null
    e = { ...base, from: str(v.from, 40), to: str(v.to, 40), amount: Number.isFinite(amount) ? amount : 0, date: dateOk(v.date) ? v.date : '1970-01-01', note: str(v.note, 200), settle: !!v.settle }
  } else return null
  return JSON.stringify(e).length <= LIMITS.entityBytes ? e : null
}

/** Applies a batch of operations; returns { state, changed, rejected }. Never mutates the input. */
export function applyOps(state, ops, now = Date.now()) {
  const next = { ...state, members: { ...state.members }, events: { ...state.events }, expenses: { ...state.expenses }, payments: { ...state.payments } }
  let changed = false
  let rejected = 0
  for (const op of Array.isArray(ops) ? ops.slice(0, 200) : []) {
    if (op?.t === 'meta') {
      const u = Number.isFinite(op.u) ? op.u : now
      if (u < (state.metaU || 0)) continue
      const name = op.v?.name !== undefined ? str(op.v.name, 80).trim() : next.name
      const currency = op.v?.currency !== undefined ? str(op.v.currency, 6) : next.currency
      if (name && (name !== next.name || currency !== next.currency)) {
        next.name = name
        next.currency = currency || next.currency
        next.metaU = u
        changed = true
      }
    } else if (op?.t === 'set' && COLLECTIONS.includes(op.c)) {
      const e = cleanEntity(op.c, op.id, op.v, now)
      if (!e) { rejected += 1; continue }
      const prev = next[op.c][e.id]
      if (prev && prev.u > e.u) continue // a newer edit already won
      if (!prev && Object.keys(next[op.c]).length >= LIMITS[op.c]) { rejected += 1; continue }
      if (prev && JSON.stringify(prev) === JSON.stringify(e)) continue
      next[op.c][e.id] = e
      changed = true
    } else rejected += 1
  }
  if (changed) {
    next.version = (state.version || 0) + 1
    next.updatedAt = now
    if (JSON.stringify(next).length > LIMITS.stateBytes) return { state, changed: false, rejected: rejected + ops.length }
  }
  return { state: changed ? next : state, changed, rejected }
}

/* ───────────── reading helpers ───────────── */

export const live = (group, coll) => Object.values(group?.[coll] || {}).filter((x) => !x.deleted)
export const members = (group) => live(group, 'members').sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
export const memberName = (group, id) => group?.members?.[id]?.name || 'Someone'
export const toMinor = (n) => Math.round((Number(n) + Number.EPSILON) * 100)
export const fromMinor = (n) => n / 100

/** Splits `totalMinor` equally; leftover cents go to the first people so the parts add up exactly. */
export function splitEqual(totalMinor, ids) {
  const out = {}
  if (!ids.length) return out
  const base = Math.floor(totalMinor / ids.length)
  let rem = totalMinor - base * ids.length
  for (const id of ids) {
    out[id] = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem -= 1
  }
  return out
}

/**
 * Per-member totals in minor units. net > 0 → the group owes them; net < 0 → they owe the group.
 * `eventId` limits expenses (payments always count) – used by the per-event view only.
 */
export function computeBalances(group, { eventId } = {}) {
  const rows = new Map(members(group).map((m) => [m.id, { id: m.id, name: m.name, paid: 0, share: 0, sent: 0, received: 0, net: 0 }]))
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { id, name: memberName(group, id), paid: 0, share: 0, sent: 0, received: 0, net: 0 })
    return rows.get(id)
  }
  for (const e of live(group, 'expenses')) {
    if (eventId && e.eventId !== eventId) continue
    const total = toMinor(e.amount)
    row(e.paidBy).paid += total
    for (const [id, part] of Object.entries(splitEqual(total, e.split))) row(id).share += part
  }
  for (const p of live(group, 'payments')) {
    const a = toMinor(p.amount)
    row(p.from).sent += a
    row(p.to).received += a
  }
  for (const r of rows.values()) r.net = r.paid - r.share + r.sent - r.received
  return [...rows.values()]
}

/** Fewest simple transfers that settle everyone (greedy: biggest debtor pays biggest creditor). */
export function suggestSettlements(balances) {
  const cred = balances.filter((b) => b.net > 0).map((b) => ({ id: b.id, left: b.net }))
  const debt = balances.filter((b) => b.net < 0).map((b) => ({ id: b.id, left: -b.net }))
  const order = (a, b) => b.left - a.left || a.id.localeCompare(b.id)
  const out = []
  for (;;) {
    cred.sort(order)
    debt.sort(order)
    const c = cred.find((x) => x.left > 0)
    const d = debt.find((x) => x.left > 0)
    if (!c || !d) break
    const amount = Math.min(c.left, d.left)
    out.push({ from: d.id, to: c.id, amount })
    c.left -= amount
    d.left -= amount
  }
  return out
}

export const groupTotal = (group, eventId) =>
  live(group, 'expenses').filter((e) => !eventId || e.eventId === eventId).reduce((s, e) => s + toMinor(e.amount), 0)
