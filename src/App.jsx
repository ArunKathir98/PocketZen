import { useEffect, useRef, useState } from 'react'
import { CircleUserRound, Handshake, HandCoins, Users, Landmark, LayoutGrid, ListChecks, PiggyBank, BellRing, X } from 'lucide-react'
import { useApp } from './lib/store'
import { checkDue } from './lib/reminders'
import { getPendingJoin } from './lib/pendingJoin'
import { useDialog } from './components/dialog'
import { Logo } from './components/ui'
import { BackupBanner, InstallBanner, NotifyBanner } from './components/Banners'
import LocalWelcome from './components/LocalWelcome'
import Login from './pages/Login'
import PinLock from './pages/PinLock'
import Records from './pages/Records'
import Categories from './pages/Categories'
import Accounts from './pages/Accounts'
import Budget from './pages/Budget'
import Reminders from './pages/Reminders'
import Emi from './pages/Emi'
import Loans from './pages/Loans'
import Groups from './pages/Groups'
import User from './pages/User'

const TABS = [
  ['records', 'Records', ListChecks, Records],
  ['categories', 'Categories', LayoutGrid, Categories],
  ['accounts', 'Accounts', Landmark, Accounts],
  ['budget', 'Budget', PiggyBank, Budget],
  ['emi', 'EMIs', HandCoins, Emi, 'showEmi'],
  ['groups', 'Groups', Users, Groups, 'showGroups'],
  ['loans', 'Loans', Handshake, Loans, 'showLoans'],
  ['reminders', 'Reminders', BellRing, Reminders, 'showReminders'],
  ['user', 'Profile', CircleUserRound, User],
]

// Without a Google account the app is a simple tracker: only these pages are available.
const LITE_TABS = new Set(['records', 'categories', 'accounts', 'user'])

const SYNC_LABEL = { idle: 'Local', local: 'On this device', syncing: 'Syncing…', synced: 'Synced to Drive', offline: 'Offline', auth: 'Reconnect needed', error: 'Sync error' }

export default function App() {
  const { session, ready, locked, data, sync, reconnect, isLocal, setSettings } = useApp()
  const { alert } = useDialog()
  const warnedJoin = useRef(false)
  const [tab, setTab] = useState(() => localStorage.getItem('pz:tab') || 'records')
  const [toasts, setToasts] = useState([])
  const tabs = TABS.filter((t) => (isLocal ? LITE_TABS.has(t[0]) : !t[4] || data.settings[t[4]]))

  useEffect(() => localStorage.setItem('pz:tab', tab), [tab])

  // Opened from an invite link: go straight to Groups (a Google account is needed for groups).
  useEffect(() => {
    if (!session || !ready || locked || !getPendingJoin()) return
    if (isLocal) {
      if (!warnedJoin.current) {
        warnedJoin.current = true
        alert({ title: 'Sign in to join', message: 'Group expenses need a Google account. Connect Google in Profile → Backup & sync, then open the invite link again.' })
      }
      return
    }
    if (!data.settings.showGroups) setSettings({ showGroups: true })
    setTab('groups')
  }, [session, ready, locked, isLocal]) // eslint-disable-line react-hooks/exhaustive-deps

  // In-app scheduler for bill reminders and the daily nudge.
  useEffect(() => {
    if (!session || locked || isLocal) return // reminders are a Google-account feature
    const run = () => {
      const msgs = checkDue(data)
      if (msgs.length) setToasts((t) => [...t, ...msgs])
    }
    run()
    const id = setInterval(run, 30000)
    const onVis = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [session, locked, isLocal, data])

  if (!ready) return <div className="auth"><Logo className="logo-lg" /></div>
  if (!session) return <><div className="ambient" /><Login /></>
  if (locked) return <><div className="ambient" /><PinLock /></>

  const Page = tabs.find((t) => t[0] === tab)?.[3] || Records
  const activeTab = tabs.some((t) => t[0] === tab) ? tab : 'records'

  return (
    <>
      <div className="ambient" />
      <div className="shell">
        <nav className="sidebar" aria-label="Main">
          <div className="brand"><Logo className="" alt="" /><span>Pocket<span className="grad-text">Zen</span></span></div>
          {tabs.map(([k, label, Icon]) => (
            <button key={k} className={`nav-item ${activeTab === k ? 'active' : ''}`} onClick={() => setTab(k)} aria-current={activeTab === k ? 'page' : undefined}>
              <Icon /> {label}
            </button>
          ))}
          <div className="grow" />
          <div className={`sync st-${sync}`} style={{ justifyContent: 'center' }} title={SYNC_LABEL[sync]}><i /><span className="s-lbl">{SYNC_LABEL[sync]}</span></div>
        </nav>

        <main className="content">
          <div className="page" style={{ paddingBottom: 0, paddingTop: 'calc(var(--safe-t) + 10px)' }}>
            <InstallBanner style={{ marginBottom: 0 }} />
            <NotifyBanner />
            <BackupBanner />
          </div>
          {(sync === 'auth' || sync === 'error') && (
            <div className="page" style={{ paddingBottom: 0 }}>
              <div className="banner" role="alert" style={{ marginBottom: 0 }}>
                <span>{sync === 'auth' ? 'Google Drive needs to reconnect. Your changes are saved on this device.' : 'Couldn’t reach Drive. Your changes are saved on this device and will retry.'}</span>
                <button className="btn sm primary" onClick={reconnect}>Reconnect</button>
              </div>
            </div>
          )}
          <Page />
        </main>

        <nav className="bottom-nav" aria-label="Main">
          {tabs.map(([k, label, Icon]) => (
            <button key={k} className={`nav-item ${activeTab === k ? 'active' : ''}`} onClick={() => setTab(k)} aria-current={activeTab === k ? 'page' : undefined}>
              <Icon /> {label}
            </button>
          ))}
        </nav>
      </div>

      {isLocal && <LocalWelcome />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <BellRing size={18} /> <span><b>{t.title}</b> — {t.body}</span>
            <button aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  )
}
