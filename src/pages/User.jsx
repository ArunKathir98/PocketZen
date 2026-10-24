import { useRef, useState } from 'react'
import { BellRing, CalendarClock, DatabaseBackup, HandCoins, KeyRound, LogOut, Moon, RefreshCw, RotateCcw, Smartphone, Sun, SunMoon, Trash2, Upload, Wallet } from 'lucide-react'
import { useApp } from '../lib/store'
import { CURRENCIES } from '../lib/defaults'
import { hashPin, hashRecovery, makeRecoveryCode, verifyPin } from '../lib/pin'
import { parseBackup } from '../lib/backup'
import { askNotificationPermission, notificationsSupported } from '../lib/reminders'
import PinPad from '../components/PinPad'
import NotificationsCard from '../components/NotificationsCard'
import ShareCard from '../components/ShareCard'
import CloudCard, { ago } from '../components/CloudCard'
import BackupModal from '../components/BackupModal'
import RecoveryModal from '../components/RecoveryModal'
import { Modal, Toggle } from '../components/ui'
import { useDialog } from '../components/dialog'

export const applyTheme = (t) => {
  localStorage.setItem('pz:theme', t)
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export default function User() {
  const { data, session, isLocal, setSettings, setPin, logout, replaceAll, mergeIn, sync, syncNow, lock } = useApp()
  const { confirm, choose } = useDialog()
  const [theme, setTheme] = useState(() => localStorage.getItem('pz:theme') || 'system')
  const [pinFlow, setPinFlow] = useState(null) // 'set' | 'change' | 'remove'
  const [msg, setMsg] = useState('')
  const [backupOpen, setBackupOpen] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [askPw, setAskPw] = useState(null) // { text, error }
  const file = useRef(null)
  const s = data.settings

  const pickTheme = (t) => { setTheme(t); applyTheme(t) }

  const runImport = async (text, password) => {
    let inc
    try {
      inc = await parseBackup(text, password)
    } catch (e) {
      if (e.message === 'password_required') return setAskPw({ text, error: '' })
      if (e.message === 'bad_password') return setAskPw({ text, error: 'Wrong password. Try again.' })
      return setMsg("That file isn't a valid PocketZen backup.")
    }
    setAskPw(null)
    const choice = await choose({
      title: 'Import backup',
      message: `${inc.transactions.length} records, ${inc.accounts?.length || 0} accounts found.\nReplace your current data, or merge the backup into it?`,
      actions: [
        { label: 'Cancel', value: null, variant: 'ghost' },
        { label: 'Merge', value: 'merge', variant: 'ghost' },
        { label: 'Replace all', value: 'replace', variant: 'danger-solid' },
      ],
    })
    if (!choice) return
    choice === 'replace' ? replaceAll(inc) : mergeIn(inc)
    setMsg(choice === 'replace' ? 'Data replaced from backup.' : 'Backup merged into your data.')
  }

  const pickFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const text = await f.text()
    runImport(text)
  }

  const toggleDaily = (on) => {
    setSettings({ dailyReminder: on })
    if (on) {
      askNotificationPermission().then((p) => {
        if (p === 'denied') setMsg('Notifications are blocked in your browser — you will only see in-app reminders.')
      })
    }
  }

  const newRecovery = async () => {
    const code = makeRecoveryCode()
    setPin({ ...data.pin, recovery: await hashRecovery(code) })
    setRecoveryCode(code)
  }

  const leave = async () => {
    if (!isLocal) {
      const ok = await confirm({ title: 'Log out?', message: 'You will be signed out on this device. Your data stays safe in your Google Drive.', confirmText: 'Log out', danger: true })
      if (ok) logout()
      return
    }
    const choice = await choose({
      title: 'Erase all data?',
      message: 'PocketZen is saving your data only on this device. Erasing it cannot be undone. Back it up first, or connect Google Drive.',
      danger: true,
      actions: [
        { label: 'Cancel', value: null, variant: 'ghost' },
        { label: 'Erase everything', value: 'erase', variant: 'danger-solid' },
        { label: 'Back up first', value: 'backup', variant: 'primary' },
      ],
    })
    if (choice === 'backup') setBackupOpen(true)
    else if (choice === 'erase') logout()
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Profile</h1><p>Preferences & your data</p></div></div>
      <div className="stack" style={{ maxWidth: 720 }}>
        <div className="card pad profile">
          <div className="avatar">
            {isLocal ? <Smartphone size={24} /> : session?.picture ? <img src={session.picture} alt="" referrerPolicy="no-referrer" /> : (session?.name || '?')[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{isLocal ? 'On this device' : session?.name}</div>
            <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{isLocal ? 'No account · data stays on this phone' : session?.email}</div>
          </div>
          {!isLocal && <button className="icon-btn" aria-label="Sync now" title={`Sync (${sync})`} onClick={syncNow}><RefreshCw size={18} /></button>}
        </div>

        {msg && <div className="note-box" role="status" onClick={() => setMsg('')}>{msg}</div>}

        <div className="section-title" style={{ marginTop: 6 }}>Backup &amp; sync</div>
        <CloudCard onMessage={setMsg} />

        <div className="section-title">Appearance</div>
        <div className="card pad">
          <div className="seg full">
            {[['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'Auto', SunMoon]].map(([k, l, Icon]) => (
              <button key={k} className={theme === k ? 'on' : ''} onClick={() => pickTheme(k)}><Icon size={15} style={{ verticalAlign: '-3px' }} /> {l}</button>
            ))}
          </div>
        </div>

        <div className="section-title">Preferences</div>
        <div className="card list">
          <div className="setting">
            <span className="si"><Wallet size={19} /></span>
            <span className="main"><div className="t">Currency</div></span>
            <select className="select" style={{ width: 'auto' }} value={s.currency} onChange={(e) => setSettings({ currency: e.target.value })} aria-label="Currency">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="setting">
            <span className="si"><BellRing size={19} /></span>
            <span className="main">
              <div className="t">Daily expense reminder</div>
              <div className="s">{notificationsSupported() ? 'Nudge me to log today’s spending' : 'Notifications unsupported — in-app only'}</div>
            </span>
            {s.dailyReminder && <input type="time" className="input" style={{ width: 'auto', padding: '8px 10px' }} value={s.dailyReminderTime} onChange={(e) => setSettings({ dailyReminderTime: e.target.value })} aria-label="Reminder time" />}
            <Toggle on={s.dailyReminder} onChange={toggleDaily} label="Daily expense reminder" />
          </div>
        </div>

        <div className="section-title">Notifications</div>
        <NotificationsCard onMessage={setMsg} />

        <div className="section-title">Pages</div>
        <div className="card list">
          <div className="setting">
            <span className="si"><HandCoins size={19} /></span>
            <span className="main"><div className="t">EMI tracker</div><div className="s">Track loans, pending months and payments</div></span>
            <Toggle on={!!s.showEmi} onChange={(v) => setSettings({ showEmi: v })} label="EMI tracker page" />
          </div>
          <div className="setting">
            <span className="si"><CalendarClock size={19} /></span>
            <span className="main"><div className="t">Bill reminders</div><div className="s">Recurring reminders for bills</div></span>
            <Toggle on={!!s.showReminders} onChange={(v) => { setSettings({ showReminders: v }); if (v) askNotificationPermission() }} label="Bill reminders page" />
          </div>
        </div>

        <div className="section-title">Security</div>
        <div className="card list">
          {!data.pin ? (
            <button className="setting" onClick={() => setPinFlow('set')}>
              <span className="si"><KeyRound size={19} /></span>
              <span className="main"><div className="t">Set app PIN</div><div className="s">Ask for a 4-digit PIN when opening the app</div></span>
            </button>
          ) : (
            <>
              <button className="setting" onClick={() => setPinFlow('change')}>
                <span className="si"><KeyRound size={19} /></span>
                <span className="main"><div className="t">Change PIN</div></span>
              </button>
              <button className="setting" onClick={lock}>
                <span className="si"><KeyRound size={19} /></span>
                <span className="main"><div className="t">Lock now</div></span>
              </button>
              {isLocal && (
                <button className="setting" onClick={newRecovery}>
                  <span className="si"><RotateCcw size={19} /></span>
                  <span className="main"><div className="t">New recovery code</div><div className="s">Replaces the old code, which stops working</div></span>
                </button>
              )}
              <button className="setting" onClick={() => setPinFlow('remove')}>
                <span className="si"><KeyRound size={19} /></span>
                <span className="main"><div className="t">Remove PIN</div></span>
              </button>
            </>
          )}
        </div>

        <div className="section-title">Your data</div>
        <div className="card list">
          <button className="setting" onClick={() => setBackupOpen(true)}>
            <span className="si"><DatabaseBackup size={19} /></span>
            <span className="main"><div className="t">Export backup</div><div className="s">Last backup: {ago(s.lastBackupAt)} · optional password</div></span>
          </button>
          <button className="setting" onClick={() => file.current?.click()}>
            <span className="si"><Upload size={19} /></span>
            <span className="main"><div className="t">Import data</div><div className="s">Restore from a PocketZen backup file</div></span>
          </button>
          <input ref={file} type="file" accept="application/json,text/plain,.json" hidden onChange={pickFile} />
        </div>

        <div className="section-title">Share &amp; feedback</div>
        <ShareCard onMessage={setMsg} />

        <button className="btn danger block" style={{ marginTop: 10 }} onClick={leave}>
          {isLocal ? <><Trash2 size={18} /> Erase data &amp; start over</> : <><LogOut size={18} /> Log out</>}
        </button>
        <p className="fine" style={{ textAlign: 'center' }}>PocketZen · Your Money. Your Control.</p>
      </div>

      {pinFlow && (
        <PinFlow mode={pinFlow} onClose={() => setPinFlow(null)}
          onDone={(m, code) => { setMsg(m); setPinFlow(null); if (code) setRecoveryCode(code) }} />
      )}
      {backupOpen && <BackupModal onClose={() => setBackupOpen(false)} onDone={setMsg} />}
      {recoveryCode && <RecoveryModal code={recoveryCode} onClose={() => setRecoveryCode('')} />}
      {askPw && <PasswordModal error={askPw.error} onClose={() => setAskPw(null)} onSubmit={(pw) => runImport(askPw.text, pw)} />}
    </div>
  )
}

function PasswordModal({ error, onClose, onSubmit }) {
  const [pw, setPw] = useState('')
  return (
    <Modal title="Password-protected backup" onClose={onClose}
      footer={<button className="btn primary block" disabled={!pw} onClick={() => onSubmit(pw)}>Unlock backup</button>}>
      <div className="field">
        <label htmlFor="ip">Enter the password you chose when exporting</label>
        <input id="ip" type="password" className="input" autoFocus value={pw} onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && pw && onSubmit(pw)} />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </Modal>
  )
}

function PinFlow({ mode, onClose, onDone }) {
  const { data, setPin, isLocal } = useApp()
  const [step, setStep] = useState(mode === 'set' ? 'new' : 'old') // old | new | confirm
  const [key, setKey] = useState(0)
  const [err, setErr] = useState('')
  const first = useRef('')
  const next = (s) => { setStep(s); setKey((k) => k + 1) }

  const onPin = async (pin) => {
    setErr('')
    if (step === 'old') {
      if (!(await verifyPin(pin, data.pin))) { setErr('Wrong PIN'); return false }
      if (mode === 'remove') { setPin(null); onDone('PIN removed.'); return true }
      next('new'); return true
    }
    if (step === 'new') { first.current = pin; next('confirm'); return true }
    if (pin !== first.current) { setErr("PINs didn't match"); next('new'); return false }
    const record = await hashPin(pin)
    let code
    if (isLocal) {
      // no Google account to re-verify with: issue a recovery code
      code = makeRecoveryCode()
      record.recovery = await hashRecovery(code)
    }
    setPin(record)
    onDone('PIN saved.', code)
    return true
  }
  const title = { old: 'Enter current PIN', new: 'Choose a 4-digit PIN', confirm: 'Confirm your PIN' }[step]
  return (
    <Modal title={mode === 'remove' ? 'Remove PIN' : mode === 'change' ? 'Change PIN' : 'Set PIN'} onClose={onClose}>
      <p className="muted" style={{ textAlign: 'center', fontWeight: 600 }}>{title}</p>
      <PinPad onComplete={onPin} resetKey={key} />
      {err && <p className="err" style={{ textAlign: 'center' }}>{err}</p>}
    </Modal>
  )
}
