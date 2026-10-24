import { useState } from 'react'
import { Copy, KeyRound } from 'lucide-react'
import { Modal } from './ui'

/** Shows the one-time PIN recovery code (local-only mode). */
export default function RecoveryModal({ code, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch { /* clipboard blocked – the code is on screen */ }
  }
  return (
    <Modal title="Save your recovery code" onClose={onClose}
      footer={<button className="btn primary block" onClick={onClose}>I've saved it</button>}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="dlg-ico"><KeyRound size={22} /></span>
        <div className="num" aria-label="Recovery code" style={{ fontSize: 28, fontWeight: 900, letterSpacing: 2, padding: '10px 6px', userSelect: 'all', WebkitUserSelect: 'all' }}>{code}</div>
        <button className="btn sm ghost" onClick={copy}><Copy size={14} /> {copied ? 'Copied' : 'Copy code'}</button>
        <p className="muted" style={{ fontSize: 13 }}>
          You're using PocketZen without a Google account, so this code is the <b>only way to reset a forgotten PIN</b>.
          Take a screenshot or store it in a password manager. It won't be shown again.
        </p>
      </div>
    </Modal>
  )
}
