import { useState } from 'react'
import { BellRing, Download, Smartphone, Volume2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { useInstall } from '../lib/install'
import { askNotificationPermission, notificationsSupported } from '../lib/reminders'
import { fireReminder, playChime, vibrate } from '../lib/notify'
import { Toggle } from './ui'

export default function NotificationsCard({ onMessage }) {
  const { data, setSettings } = useApp()
  const { installed, canPrompt, ios, prompt } = useInstall()
  const [, force] = useState(0)
  const s = data.settings
  const supported = notificationsSupported()
  const perm = supported ? Notification.permission : 'unsupported'

  const enable = async () => {
    const p = await askNotificationPermission()
    force((n) => n + 1)
    if (p === 'denied') onMessage('Notifications are blocked. Allow them in your browser or phone settings for this site.')
  }

  const test = () => {
    onMessage('Test sent — lock your screen or switch apps within 5 seconds.')
    setTimeout(() => fireReminder({ title: 'PocketZen test', body: 'Notifications are working 🎉', tag: 'pz-test' }, s, { force: true }), 5000)
  }

  const permLabel = { granted: 'On', denied: 'Blocked', default: 'Off', unsupported: 'Unavailable' }[perm]

  return (
    <div className="card list">
      <div className="setting">
        <span className="si"><BellRing size={19} /></span>
        <span className="main">
          <div className="t">Notifications · {permLabel}</div>
          <div className="s">
            {perm === 'unsupported' ? (ios ? 'On iPhone, add PocketZen to your Home Screen first, then open it from there.' : 'This browser does not support notifications.')
              : perm === 'denied' ? 'Blocked — enable them in browser / phone settings.'
              : perm === 'granted' ? 'Reminders can alert you.' : 'Allow so reminders can alert you.'}
          </div>
        </span>
        {perm === 'default' && <button className="btn sm primary" onClick={enable}>Allow</button>}
      </div>
      <div className="setting">
        <span className="si"><Volume2 size={19} /></span>
        <span className="main"><div className="t">Sound &amp; vibration</div><div className="s">Chime in the app; notification sound follows your phone's settings</div></span>
        <Toggle on={s.notifySound !== false} onChange={(v) => setSettings({ notifySound: v })} label="Sound and vibration" />
      </div>
      <div className="setting" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="si"><Smartphone size={19} /></span>
        <span className="main"><div className="t">Try it</div></span>
        <button className="btn sm ghost" onClick={() => { playChime(); vibrate() }}>Play sound</button>
        <button className="btn sm ghost" onClick={test} disabled={perm !== 'granted'}>Test in 5s</button>
      </div>
      {!installed && (canPrompt || ios) && (
        <div className="setting">
          <span className="si"><Download size={19} /></span>
          <span className="main"><div className="t">Install app</div><div className="s">{canPrompt ? 'Add PocketZen to your home screen' : 'Tap Share, then Add to Home Screen'}</div></span>
          {canPrompt && <button className="btn sm primary" onClick={prompt}>Install</button>}
        </div>
      )}
    </div>
  )
}
