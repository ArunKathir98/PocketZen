import { useEffect, useState } from 'react'
import { BellRing, ChartPie, CircleUserRound, Ellipsis, HandCoins, Handshake, Landmark, LayoutGrid, ListChecks, PiggyBank, Users, X } from 'lucide-react'
import { useApp } from './lib/store'
import { checkDue } from './lib/reminders'
import { clearPendingJoin, getPendingJoin } from './lib/pendingJoin'
import { isGroupId, parseGroupRef } from './lib/groupState'
import PublicGroup from './pages/PublicGroup'
import { groupSharingEnabled } from './lib/google'
import { Logo, Modal } from './components/ui'
import { BackupBanner, InstallBanner, NotifyBanner } from './components/Banners'
import LocalWelcome from './components/LocalWelcome'
import Login from './pages/Login'
import PinLock from './pages/PinLock'
import Records from './pages/Records'
import Analysis from './pages/Analysis'
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
  ['analysis', 'Analysis', ChartPie, Analysis, 'showAnalysis'],
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
const LITE_TABS = new Set(['records', 'analysis', 'categories', 'accounts', 'user'])

const SYNC_LABEL = { idle: 'Local', local: 'On this device', syncing: 'Syncing…', synced: 'Synced to Drive', offline: 'Offline', auth: 'Reconnect needed', error: 'Sync error' }

export default function App() {
  const { session, ready, locked, data, sync, reconnect, isLocal, setSettings } = useApp()
  const [showPublic, setShowPublic] = useState(true)
  const [tab, setTab] = useState(() => localStorage.getItem('pz:tab') || 'records')
  const [toasts, setToasts] = useState([])
  const [moreOpen, setMoreOpen] = useState(false)
  const tabs = TABS.filter((t) => (isLocal ? LITE_TABS.has(t[0]) : !t[4] || data.settings[t[4]]))

  useEffect(() => localStorage.setItem('pz:tab', tab), [tab])

  // Opened from a group link while signed in with Google: go to Groups and offer to save it.
  useEffect(() => {
    if (!session || !ready || locked || !getPendingJoin()) return
    if (isLocal) return // they can view the group on the public page; saving groups needs a Google account
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
  if (session && locked) return <><div className="ambient" /><PinLock /></>
  // A group link opened by someone not signed in with Google: show it read-only, no sign-in needed.
  const sharingOn = groupSharingEnabled()
  if (!sharingOn && getPendingJoin()) clearPendingJoin() // group links are switched off
  const link = sharingOn && getPendingJoin() ? parseGroupRef(getPendingJoin()) : ''
  if (link && !isGroupId(link)) clearPendingJoin()
  if (isGroupId(link) && showPublic && (!session || isLocal)) {
    return <PublicGroup id={link} onClose={(keep) => { if (!keep) clearPendingJoin(); setShowPublic(false) }} />
  }
  if (!session) return <><div className="ambient" /><Login /></>

  const Page = tabs.find((t) => t[0] === tab)?.[3] || Records
  const activeTab = tabs.some((t) => t[0] === tab) ? tab : 'records'

  // Phone bottom bar: at most 5 slots. With more pages than that, show 3 pages + "More" + Profile (always visible).
  const MAX_SLOTS = 5
  const crowded = tabs.length > MAX_SLOTS
  const profile = tabs.find((t) => t[0] === 'user')
  const rest = tabs.filter((t) => t[0] !== 'user')
  const barTabs = crowded ? rest.slice(0, MAX_SLOTS - 2) : rest
  const moreTabs = crowded ? rest.slice(MAX_SLOTS - 2) : []
  const moreActive = moreTabs.some((t) => t[0] === activeTab)
  const go = (k) => { setTab(k); setMoreOpen(false) }

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
          {barTabs.map(([k, label, Icon]) => (
            <button key={k} className={`nav-item ${activeTab === k ? 'active' : ''}`} onClick={() => go(k)} aria-current={activeTab === k ? 'page' : undefined}>
              <Icon /> {label}
            </button>
          ))}
          {crowded && (
            <button className={`nav-item ${moreActive ? 'active' : ''}`} onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-label={`More pages (${moreTabs.length})`}>
              <Ellipsis /> More
            </button>
          )}
          {profile && (
            <button className={`nav-item ${activeTab === 'user' ? 'active' : ''}`} onClick={() => go('user')} aria-current={activeTab === 'user' ? 'page' : undefined}>
              {(() => { const Icon = profile[2]; return <Icon /> })()} {profile[1]}
            </button>
          )}
        </nav>
      </div>

      {moreOpen && (
        <Modal title="More pages" onClose={() => setMoreOpen(false)}>
          <div className="more-grid">
            {moreTabs.map(([k, label, Icon]) => (
              <button key={k} className={`more-item ${activeTab === k ? 'on' : ''}`} onClick={() => go(k)} aria-current={activeTab === k ? 'page' : undefined}>
                <span className="mi"><Icon size={22} /></span>{label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Turn pages on or off in Profile → Pages.</p>
        </Modal>
      )}

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
