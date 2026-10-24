import { useState } from 'react'
import { Lock } from 'lucide-react'
import { useApp } from '../lib/store'
import { saveBackupFile } from '../lib/backup'
import { Modal, Toggle } from './ui'

/** Create a backup file, optionally protected with a password. */
export default function BackupModal({ onClose, onDone }) {
  const { data, setSettings } = useApp()
  const [protect, setProtect] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const valid = !protect || (pw.length >= 6 && pw === pw2)

  const run = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await saveBackupFile(data, protect ? pw : undefined)
      if (r !== 'cancelled') {
        setSettings({ lastBackupAt: Date.now() })
        onDone?.(r === 'shared' ? 'Backup shared. Keep that file safe.' : 'Backup saved to your downloads. Keep that file safe.')
        onClose()
      }
    } catch {
      setErr('Could not create the backup.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Back up your data" onClose={onClose}
      footer={
        <div className="stack" style={{ gap: 8 }}>
          {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
          <button className="btn primary block" disabled={!valid || busy} onClick={run}>{busy ? 'Preparing…' : 'Save backup file'}</button>
        </div>
      }>
      <div className="stack">
        <p className="muted" style={{ fontSize: 13 }}>
          Saves a file with all your records. On a phone you can send it to Files, Google Drive, WhatsApp or email.
          To restore, use <b>Import data</b>.
        </p>
        <div className="setting" style={{ padding: '4px 0', borderTop: 0 }}>
          <span className="si"><Lock size={18} /></span>
          <span className="main"><div className="t">Protect with a password</div><div className="s">Recommended if you store the file anywhere shared</div></span>
          <Toggle on={protect} onChange={setProtect} label="Protect backup with a password" />
        </div>
        {protect && (
          <>
            <div className="field"><label htmlFor="bp1">Password (6+ characters)</label>
              <input id="bp1" type="password" className="input" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="field"><label htmlFor="bp2">Repeat password</label>
              <input id="bp2" type="password" className="input" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            {pw2 && pw !== pw2 && <p className="err" style={{ margin: 0 }}>Passwords don't match.</p>}
            <div className="note-box warn">If you forget this password, the backup cannot be opened — not even by us.</div>
          </>
        )}
      </div>
    </Modal>
  )
}
