import { useState } from 'react'
import { BellRing, DatabaseBackup, Download, Share, X } from 'lucide-react'
import { useApp } from '../lib/store'
import { useInstall } from '../lib/install'
import { askNotificationPermission, notificationsSupported } from '../lib/reminders'
import BackupModal from './BackupModal'

const DISMISS_KEY = 'pz:installDismissed'
const WEEK = 7 * 24 * 3600 * 1000
const dismissedRecently = () => {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < WEEK } catch { return false }
}

/** "Install PocketZen" prompt – Android/desktop via the browser event, iOS via instructions. */
export function InstallBanner({ style }) {
  const { canPrompt, ios, installed, prompt } = useInstall()
  const [hidden, setHidden] = useState(dismissedRecently)
  if (installed || hidden || !(canPrompt || ios)) return null
  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setHidden(true)
  }
  return (
    <div className="banner install" role="region" aria-label="Install app" style={style}>
      <Download size={18} style={{ flex: 'none' }} />
      {canPrompt ? (
        <>
          <span>Install PocketZen for a full-screen app and reminders.</span>
          <button className="btn sm primary" onClick={prompt}>Install</button>
        </>
      ) : (
        <span>To install: tap <Share size={14} style={{ verticalAlign: '-2px' }} /> <b>Share</b>, then <b>Add to Home Screen</b>.</span>
      )}
      <button className="icon-btn" style={{ width: 28, height: 28, marginLeft: canPrompt ? 0 : 'auto' }} onClick={close} aria-label="Dismiss"><X size={14} /></button>
    </div>
  )
}

/** Shown while reminders are on but the browser hasn't been given notification permission. */
export function NotifyBanner() {
  const { data } = useApp()
  const [, force] = useState(0)
  const wants = data.settings.showReminders || data.settings.dailyReminder
  if (!wants || !notificationsSupported() || Notification.permission !== 'default') return null
  return (
    <div className="banner" role="region" aria-label="Notifications">
      <BellRing size={18} style={{ flex: 'none' }} />
      <span>Allow notifications so PocketZen can remind you.</span>
      <button className="btn sm primary" onClick={async () => { await askNotificationPermission(); force((n) => n + 1) }}>Allow</button>
    </div>
  )
}

const SNOOZE_KEY = 'pz:backupSnooze'
const NUDGE_AFTER_DAYS = 14

/** Local-only users have no cloud copy, so gently remind them to back up. */
export function BackupBanner() {
  const { data, session, isLocal } = useApp()
  const [open, setOpen] = useState(false)
  const [, force] = useState(0)
  if (!isLocal || data.transactions.length === 0) return null
  const last = data.settings.lastBackupAt || session?.since || Date.now()
  const days = Math.floor((Date.now() - last) / 86400000)
  let snoozed = false
  try { snoozed = Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0) } catch { /* ignore */ }
  if (days < NUDGE_AFTER_DAYS || snoozed) return null
  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3 * 86400000)) } catch { /* ignore */ }
    force((n) => n + 1)
  }
  return (
    <>
      <div className="banner" role="region" aria-label="Backup reminder">
        <DatabaseBackup size={18} style={{ flex: 'none' }} />
        <span>{data.settings.lastBackupAt ? `Last backup was ${days} days ago.` : 'Your data has never been backed up.'} It only lives on this device.</span>
        <button className="btn sm primary" onClick={() => setOpen(true)}>Back up</button>
        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={later} aria-label="Remind me later"><X size={14} /></button>
      </div>
      {open && <BackupModal onClose={() => setOpen(false)} />}
    </>
  )
}
