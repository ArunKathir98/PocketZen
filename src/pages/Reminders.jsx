import { useState } from 'react'
import { BellRing, Check, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { REPEATS, askNotificationPermission, nextOccurrence } from '../lib/reminders'
import { currencySymbol, fmtDateTime, money, toDateStr, toTimeStr } from '../lib/util'
import { Empty, Modal } from '../components/ui'
import { useDialog } from '../components/dialog'

export default function Reminders() {
  const { data, update, remove } = useApp()
  const { confirm } = useDialog()
  const [edit, setEdit] = useState(null)
  const now = new Date()
  const rows = data.reminders
    .map((r) => ({ r, next: nextOccurrence(r) }))
    .sort((a, b) => (a.next && b.next ? a.next - b.next : a.next ? -1 : 1))

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Reminders</h1><p>Never miss a bill</p></div>
        <button className="btn primary" onClick={() => { askNotificationPermission(); setEdit({}) }}><Plus size={18} /> New</button>
      </div>
      {rows.length === 0 ? (
        <Empty emoji="⏰" title="No reminders" text="Set a reminder for a bill — once, daily, weekly or monthly." action={<button className="btn primary" onClick={() => { askNotificationPermission(); setEdit({}) }}>Add reminder</button>} />
      ) : (
        <div className="card list">
          {rows.map(({ r, next }) => {
            const overdue = next && next < now
            return (
              <div className="item" key={r.id} style={{ opacity: next ? 1 : 0.55 }}>
                <span className="ico" style={{ background: overdue ? 'color-mix(in srgb, var(--expense) 18%, transparent)' : 'color-mix(in srgb, var(--g2) 20%, transparent)' }}>
                  <BellRing size={22} color={overdue ? 'var(--expense)' : 'var(--brand)'} />
                </span>
                <span className="main">
                  <div className="t">{r.title}{r.amount ? ` · ${money(r.amount)}` : ''}</div>
                  <div className="s" style={overdue ? { color: 'var(--expense)', fontWeight: 700 } : undefined}>
                    {next ? `${overdue ? 'Overdue · ' : ''}${fmtDateTime(next)}` : 'Completed'}
                    {r.repeat !== 'none' && <> · <Repeat size={11} style={{ verticalAlign: '-1px' }} /> {REPEATS.find((x) => x.id === r.repeat)?.label}{r.until ? ` until ${r.until}` : ''}</>}
                  </div>
                </span>
                {next && <button className="icon-btn" title="Mark as done" aria-label="Mark as done" onClick={() => update('reminders', r.id, { doneCount: (r.doneCount || 0) + 1 })}><Check size={18} /></button>}
                <button className="icon-btn" aria-label="Edit" onClick={() => setEdit(r)}><Pencil size={16} /></button>
                <button className="icon-btn danger" aria-label="Delete" onClick={async () => (await confirm({ title: `Delete "${r.title}"?`, message: 'This reminder will be removed.', confirmText: 'Delete', danger: true })) && remove('reminders', r.id)}><Trash2 size={16} /></button>
              </div>
            )
          })}
        </div>
      )}
      {edit && <ReminderForm rem={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function ReminderForm({ rem, onClose }) {
  const { add, update } = useApp()
  const editing = !!rem.id
  const soon = new Date(Date.now() + 3600 * 1000)
  const [title, setTitle] = useState(rem.title || '')
  const [amount, setAmount] = useState(rem.amount ? String(rem.amount) : '')
  const [dueAt, setDueAt] = useState(rem.dueAt || `${toDateStr(soon)}T${toTimeStr(soon)}`)
  const [repeat, setRepeat] = useState(rem.repeat || 'none')
  const [until, setUntil] = useState(rem.until || '')

  const save = () => {
    if (!title.trim() || !dueAt) return
    const v = { title: title.trim(), amount: parseFloat(amount) || 0, dueAt, repeat, until: repeat === 'none' ? '' : until }
    // changing the schedule restarts the series
    editing ? update('reminders', rem.id, { ...v, doneCount: rem.dueAt === dueAt && rem.repeat === repeat ? rem.doneCount || 0 : 0 }) : add('reminders', { ...v, doneCount: 0 })
    onClose()
  }
  return (
    <Modal title={editing ? 'Edit reminder' : 'New reminder'} onClose={onClose}
      footer={<button className="btn primary block" disabled={!title.trim() || !dueAt} onClick={save}>Save</button>}>
      <div className="stack">
        <div className="field"><label htmlFor="rt">Bill / title</label><input id="rt" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Electricity bill" /></div>
        <div className="field"><label htmlFor="ra">Amount ({currencySymbol()}, optional)</label>
          <input id="ra" className="input num" inputMode="decimal" value={amount} placeholder="0" onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setAmount(e.target.value)} />
        </div>
        <div className="field"><label htmlFor="rd">Date & time</label><input id="rd" type="datetime-local" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></div>
        <div className="field"><label>Repeat</label>
          <div className="seg full">{REPEATS.map((o) => <button key={o.id} className={repeat === o.id ? 'on' : ''} onClick={() => setRepeat(o.id)}>{o.label}</button>)}</div>
        </div>
        {repeat !== 'none' && (
          <div className="field"><label htmlFor="ru">Repeat until (optional)</label>
            <div className="row"><input id="ru" type="date" className="input" value={until} min={dueAt.slice(0, 10)} onChange={(e) => setUntil(e.target.value)} />
              {until && <button className="btn ghost sm" onClick={() => setUntil('')}>Clear</button>}</div>
          </div>
        )}
      </div>
    </Modal>
  )
}
