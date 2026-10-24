import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { COLORS, EMOJIS } from '../lib/defaults'
import { Empty, Modal } from '../components/ui'

export default function Categories() {
  const { data, remove } = useApp()
  const [type, setType] = useState('expense')
  const [edit, setEdit] = useState(null)
  const list = data.categories.filter((c) => c.type === type)

  const del = (c) => {
    const used = data.transactions.filter((t) => t.categoryId === c.id).length
    const msg = used
      ? `"${c.name}" is used by ${used} record(s). They'll show as Uncategorized. Delete anyway?`
      : `Delete "${c.name}"?`
    if (!confirm(msg)) return
    remove('categories', c.id)
    data.budgets.filter((b) => b.categoryId === c.id).forEach((b) => remove('budgets', b.id))
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Categories</h1><p>Organize where money comes from and goes</p></div>
        <button className="btn primary" onClick={() => setEdit({ type })}><Plus size={18} /> New</button>
      </div>
      <div className="stack">
        <div className="seg full" style={{ maxWidth: 360 }}>
          <button className={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>Income</button>
          <button className={`exp-on ${type === 'expense' ? 'on' : ''}`} onClick={() => setType('expense')}>Expense</button>
        </div>
        {list.length === 0 ? (
          <Empty emoji="🗂️" title={`No ${type} categories`} text="Create your first one." action={<button className="btn primary" onClick={() => setEdit({ type })}>Add category</button>} />
        ) : (
          <div className="card list">
            {list.map((c) => (
              <div className="item" key={c.id}>
                <span className="ico" style={{ background: `${c.color}26` }}>{c.icon}</span>
                <span className="main"><div className="t">{c.name}</div></span>
                <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)}><Pencil size={17} /></button>
                <button className="icon-btn danger" aria-label={`Delete ${c.name}`} onClick={() => del(c)}><Trash2 size={17} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {edit && <CategoryForm cat={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function CategoryForm({ cat, onClose }) {
  const { add, update } = useApp()
  const editing = !!cat.id
  const [name, setName] = useState(cat.name || '')
  const [icon, setIcon] = useState(cat.icon || EMOJIS[0])
  const [color, setColor] = useState(cat.color || COLORS[0])
  const [type, setType] = useState(cat.type)

  const save = () => {
    if (!name.trim()) return
    const v = { name: name.trim(), icon, color, type }
    editing ? update('categories', cat.id, v) : add('categories', v)
    onClose()
  }
  return (
    <Modal title={editing ? 'Edit category' : 'New category'} onClose={onClose}
      footer={<button className="btn primary block" disabled={!name.trim()} onClick={save}>Save</button>}>
      <div className="stack">
        {!editing && (
          <div className="seg full">
            <button className={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>Income</button>
            <button className={`exp-on ${type === 'expense' ? 'on' : ''}`} onClick={() => setType('expense')}>Expense</button>
          </div>
        )}
        <div className="field"><label htmlFor="cn">Name</label><input id="cn" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'income' ? 'e.g. Freelance' : 'e.g. Groceries'} /></div>
        <div className="field"><label>Icon</label>
          <div className="chips">{EMOJIS.map((e) => <button key={e} type="button" className={`emoji-btn ${icon === e ? 'on' : ''}`} onClick={() => setIcon(e)}>{e}</button>)}</div>
        </div>
        <div className="field"><label>Colour</label>
          <div className="swatches">{COLORS.map((c) => <button key={c} type="button" aria-label={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
        </div>
      </div>
    </Modal>
  )
}
