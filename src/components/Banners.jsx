import { useState } from 'react'
import { BellRing, Download, Share, X } from 'lucide-react'
import { useApp } from '../lib/store'
import { useInstall } from '../lib/install'
import { askNotificationPermission, notificationsSupported } from '../lib/reminders'

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
