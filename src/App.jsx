import { useEffect, useState } from 'react'
import { CircleUserRound, HandCoins, Landmark, LayoutGrid, ListChecks, PiggyBank, BellRing, X } from 'lucide-react'
import { useApp } from './lib/store'
import { checkDue } from './lib/reminders'
import { Logo } from './components/ui'
import { InstallBanner, NotifyBanner } from './components/Banners'
import Login from './pages/Login'
import PinLock from './pages/PinLock'
import Records from './pages/Records'
import Categories from './pages/Categories'
import Accounts from './pages/Accounts'
import Budget from './pages/Budget'
import Reminders from './pages/Reminders'
import Emi from './pages/Emi'
import User from './pages/User'

const TABS = [
  ['records', 'Records', ListChecks, Records],
  ['categories', 'Categories', LayoutGrid, Categories],
  ['accounts', 'Accounts', Landmark, Accounts],
  ['budget', 'Budget', PiggyBank, Budget],
  ['emi', 'EMIs', HandCoins, Emi, 'showEmi'],
  ['reminders', 'Reminders', BellRing, Reminders, 'showReminders'],
  ['user', 'Profile', CircleUserRound, User],
]

const SYNC_LABEL = { idle: 'Local', syncing: 'Syncing…', synced: 'Synced to Drive', offline: 'Offline', auth: 'Reconnect needed', error: 'Sync error' }

export default function App() {
  const { session, locked, data, sync, reconnect } = useApp()
  const [tab, setTab] = useState(() => localStorage.getItem('pz:tab') || 'records')
  const [toasts, setToasts] = useState([])
  const tabs = TABS.filter((t) => !t[4] || data.settings[t[4]])

  useEffect(() => localStorage.setItem('pz:tab', tab), [tab])

  // In-app scheduler for bill reminders and the daily nudge.
  useEffect(() => {
    if (!session || locked) return
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
  }, [session, locked, data])

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
