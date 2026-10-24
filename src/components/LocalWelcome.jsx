import { useState } from 'react'
import { Cloud, DatabaseBackup, Download, Share, Smartphone } from 'lucide-react'
import { useInstall } from '../lib/install'
import { Modal } from './ui'

const KEY = 'pz:localTipSeen'
export const localTipSeen = () => {
  try { return !!localStorage.getItem(KEY) } catch { return true }
}

/** One-time explainer for people who start without an account. */
export default function LocalWelcome() {
  const [open, setOpen] = useState(() => !localTipSeen())
  const { installed, canPrompt, ios, prompt } = useInstall()
  if (!open) return null
  const close = () => {
    try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }
  const Step = ({ icon: Icon, title, children }) => (
    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
      <span className="si" style={{ width: 36, height: 36, borderRadius: 12, background: 'color-mix(in srgb, var(--g2) 16%, var(--surface-2))', display: 'grid', placeItems: 'center', color: 'var(--brand)', flex: 'none' }}><Icon size={18} /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>{children}</div>
      </div>
    </div>
  )
  return (
    <Modal title="Welcome to PocketZen 👋" onClose={close} footer={<button className="btn primary block" onClick={close}>Got it, let's start</button>}>
      <div className="stack">
        <p className="muted" style={{ fontSize: 13 }}>You're using the simple version of PocketZen (Records, Categories and Accounts). A few quick things to keep your data safe:</p>
        <Step icon={Smartphone} title="Your data lives on this device">
          No one else can see it, but it's gone if you clear browser data or uninstall.
        </Step>
        <Step icon={Download} title="Install it as an app">
          {installed ? 'Already installed — great!' : canPrompt ? (
            <>Adds PocketZen to your home screen and protects its storage. <button className="btn sm primary" style={{ marginTop: 6 }} onClick={prompt}>Install now</button></>
          ) : ios ? (
            <>Tap <Share size={12} style={{ verticalAlign: '-2px' }} /> <b>Share</b>, then <b>Add to Home Screen</b>.</>
          ) : 'Use your browser menu → Install app / Add to Home screen.'}
        </Step>
        <Step icon={DatabaseBackup} title="Back up regularly">
          Profile → <b>Back up now</b> saves a file (optionally password-protected). We'll remind you every couple of weeks.
        </Step>
        <Step icon={Cloud} title="Change your mind anytime">
          Profile → <b>Connect Google Drive</b> moves everything to your own Drive, syncs across devices and unlocks budgets, EMIs, loans, reminders and groups.
        </Step>
      </div>
    </Modal>
  )
}
