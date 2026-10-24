import { useEffect, useState } from 'react'
import { Cloud, CloudOff, DatabaseBackup, HardDrive } from 'lucide-react'
import { useApp, normalize } from '../lib/store'
import { useDialog } from './dialog'
import * as google from '../lib/google'
import { mergeData, hasUserData } from '../lib/merge'
import { saveBackupFile } from '../lib/backup'
import BackupModal from './BackupModal'

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

export const ago = (ts) => {
  if (!ts) return 'never'
  const d = Math.floor((Date.now() - ts) / 86400000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

/** Local-only users: back up + connect Google Drive. Google users: sync status + switch to this-device-only. */
export default function CloudCard({ onMessage }) {
  const { session, isLocal, data, sync, switchToGoogle, disconnectGoogle } = useApp()
  const { choose, confirm } = useDialog()
  const [backup, setBackup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [persisted, setPersisted] = useState(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
  }, [])

  const connect = async () => {
    const first = await choose({
      title: 'Connect Google Drive',
      message: 'Your data on this device will be copied to your own Google Drive and kept in sync across devices. Saving a backup file first is a good idea.',
      actions: [
        { label: 'Cancel', value: null, variant: 'ghost' },
        { label: 'Skip backup', value: 'skip', variant: 'ghost' },
        { label: 'Back up first', value: 'backup', variant: 'primary' },
      ],
    })
    if (!first) return
    setBusy(true)
    try {
      if (first === 'backup' && (await saveBackupFile(data)) === 'cancelled') return
      await google.requestToken({ prompt: 'select_account' })
      const profile = await google.fetchProfile()
      const remote = await google.driveLoad(profile.sub, profile.email)
      let next = data
      let note = 'Connected. Your data is now saved to your Google Drive.'
      if (remote && hasUserData(remote)) {
        const r = normalize(remote)
        const choice = await choose({
          title: 'This account already has data',
          message: `${profile.email}\nDrive: ${plural(r.transactions.length, 'record')} · This device: ${plural(data.transactions.length, 'record')}\n\nHow should they be combined?`,
          actions: [
            { label: 'Cancel', value: null, variant: 'ghost' },
            { label: 'Keep Drive data only', value: 'drive', variant: 'ghost' },
            { label: 'Replace Drive with this device', value: 'local', variant: 'danger-solid' },
            { label: 'Merge both (recommended)', value: 'merge', variant: 'primary' },
          ],
        })
        if (!choice) {
          google.signOutGoogle()
          return
        }
        next = choice === 'merge' ? mergeData(r, data) : choice === 'drive' ? r : data
        note = choice === 'merge' ? 'Connected. Both sets of data were merged.' : note
      }
      await switchToGoogle(profile, next)
      onMessage(note)
    } catch (e) {
      onMessage(/popup_closed|access_denied/.test(e.message) ? 'Google sign-in was cancelled.' : `Could not connect (${e.message}).`)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Stop syncing with Google?',
      message: 'All your data stays on this device. The copy in your Drive is left untouched, and you can connect again any time.',
      confirmText: 'Stop syncing',
      danger: true,
    })
    if (ok) {
      await disconnectGoogle()
      onMessage('Now using this device only. Remember to back up regularly.')
    }
  }

  if (!isLocal) {
    return (
      <div className="card list">
        <div className="setting">
          <span className="si"><Cloud size={19} /></span>
          <span className="main"><div className="t">Synced with Google Drive</div><div className="s">{session?.email} · {sync === 'synced' ? 'up to date' : sync}</div></span>
        </div>
        <button className="setting" onClick={disconnect}>
          <span className="si"><CloudOff size={19} /></span>
          <span className="main"><div className="t">Stop syncing</div><div className="s">Keep everything on this device only</div></span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="card list">
        <div className="setting">
          <span className="si"><HardDrive size={19} /></span>
          <span className="main">
            <div className="t">Saved on this device only</div>
            <div className="s">{persisted ? 'Protected from automatic cleanup.' : 'If you clear browser data or uninstall, it is gone — back up regularly.'}</div>
          </span>
        </div>
        <button className="setting" onClick={() => setBackup(true)}>
          <span className="si"><DatabaseBackup size={19} /></span>
          <span className="main"><div className="t">Back up now</div><div className="s">Last backup: {ago(data.settings.lastBackupAt)}</div></span>
        </button>
        <button className="setting" onClick={connect} disabled={busy}>
          <span className="si"><Cloud size={19} /></span>
          <span className="main"><div className="t">{busy ? 'Connecting…' : 'Connect Google Drive'}</div><div className="s">Unlock budgets, EMIs, loans, reminders &amp; groups, plus cloud sync</div></span>
        </button>
      </div>
      {backup && <BackupModal onClose={() => setBackup(false)} onDone={onMessage} />}
    </>
  )
}
