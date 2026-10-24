// Combine two PocketZen datasets without creating duplicates.
// Accounts / categories that mean the same thing (same name [+ type]) are unified,
// and every record that pointed at the dropped copy is re-pointed at the kept one.
const norm = (s) => (s || '').trim().toLowerCase()

export function mergeData(base, inc) {
  const accounts = [...base.accounts]
  const categories = [...base.categories]
  const accMap = new Map()
  const catMap = new Map()

  for (const a of inc.accounts || []) {
    const hit = accounts.find((x) => x.id === a.id) || accounts.find((x) => norm(x.name) === norm(a.name))
    if (hit) accMap.set(a.id, hit.id)
    else {
      accounts.push(a)
      accMap.set(a.id, a.id)
    }
  }
  for (const c of inc.categories || []) {
    const hit =
      categories.find((x) => x.id === c.id) || categories.find((x) => x.type === c.type && norm(x.name) === norm(c.name))
    if (hit) catMap.set(c.id, hit.id)
    else {
      categories.push(c)
      catMap.set(c.id, c.id)
    }
  }
  const ra = (id) => (id == null ? id : accMap.get(id) ?? id)
  const rc = (id) => (id == null ? id : catMap.get(id) ?? id)

  const seen = (list) => new Set(list.map((x) => x.id))

  const txIds = seen(base.transactions)
  const transactions = [
    ...base.transactions,
    ...(inc.transactions || [])
      .filter((t) => !txIds.has(t.id))
      .map((t) => ({ ...t, accountId: ra(t.accountId), toAccountId: ra(t.toAccountId), categoryId: rc(t.categoryId) })),
  ]

  const budgets = [...base.budgets]
  for (const b of inc.budgets || []) {
    const categoryId = rc(b.categoryId)
    if (budgets.some((x) => x.id === b.id || x.categoryId === categoryId)) continue
    budgets.push({ ...b, categoryId })
  }

  const emiIds = seen(base.emis || [])
  const emis = [...(base.emis || []), ...(inc.emis || []).filter((e) => !emiIds.has(e.id)).map((e) => ({ ...e, accountId: ra(e.accountId) }))]

  // people are unified by name; loans keep their ids and are re-pointed at the kept person / account
  const people = [...(base.people || [])]
  const pMap = new Map()
  for (const p of inc.people || []) {
    const hit = people.find((x) => x.id === p.id) || people.find((x) => norm(x.name) === norm(p.name))
    if (hit) pMap.set(p.id, hit.id)
    else {
      people.push(p)
      pMap.set(p.id, p.id)
    }
  }
  const loanIds = seen(base.loans || [])
  const loans = [
    ...(base.loans || []),
    ...(inc.loans || [])
      .filter((l) => !loanIds.has(l.id))
      .map((l) => ({ ...l, personId: pMap.get(l.personId) ?? l.personId, events: (l.events || []).map((e) => ({ ...e, accountId: ra(e.accountId) })) })),
  ]

  const remIds = seen(base.reminders)
  const reminders = [...base.reminders, ...(inc.reminders || []).filter((r) => !remIds.has(r.id))]

  return {
    ...base,
    accounts,
    categories,
    transactions,
    budgets,
    emis,
    people,
    loans,
    reminders,
    settings: {
      ...base.settings,
      showEmi: !!(base.settings?.showEmi || inc.settings?.showEmi),
      showReminders: !!(base.settings?.showReminders || inc.settings?.showReminders),
      showLoans: !!(base.settings?.showLoans || inc.settings?.showLoans),
    },
    pin: base.pin || inc.pin || null,
  }
}

/** True when a dataset holds anything the user actually entered. */
export const hasUserData = (d) =>
  !!d && ((d.transactions?.length || 0) + (d.budgets?.length || 0) + (d.emis?.length || 0) + (d.reminders?.length || 0) + (d.loans?.length || 0) > 0)
