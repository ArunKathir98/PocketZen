import { CalendarClock, CloudCog, PiggyBank, ShieldCheck } from 'lucide-react'
import { useApp } from '../lib/store'
import { hasClientId } from '../lib/google'
import { GoogleG, Logo } from '../components/ui'
import { InstallBanner } from '../components/Banners'
import { getPendingJoin } from '../lib/pendingJoin'

const FEATURES = [
  [PiggyBank, 'Track income, expenses & transfers'],
  [CloudCog, 'Budgets, EMIs, loans & group expenses'],
  [CalendarClock, 'Bill reminders with sound & vibration'],
  [ShieldCheck, 'Stored in your own Google Drive — never on our servers'],
]

export default function Login() {
  const { login, loginLocal, loggingIn, error } = useApp()
  return (
    <div className="auth">
      <div className="auth-card wide">
        <div>
          <Logo />
          <h1>Pocket<span className="grad-text">Zen</span></h1>
          <p className="tag">Your Money. Your Control.</p>
          <p className="desc">
            A personal finance companion to track income, manage expenses, organize accounts, set budgets, and stay on
            top of bills — with your financial records stored in your own Google Drive.
          </p>
        </div>
        <div className="stack">
        <InstallBanner />
        {getPendingJoin() && <div className="banner install" role="status">Sign in with Google to save the group you were sent to your list.</div>}
        <div className="card pad" style={{ padding: 24 }}>
          <ul className="feat">
            {FEATURES.map(([Icon, text]) => (
              <li key={text}>
                <span className="fi"><Icon size={19} /></span>
                {text}
              </li>
            ))}
          </ul>
          <button className="g-btn" onClick={login} disabled={loggingIn || !hasClientId()}>
            <GoogleG /> {loggingIn ? 'Signing in…' : 'Continue with Google'}
          </button>
          <div className="or"><span>or</span></div>
          <button className="btn ghost block" onClick={loginLocal} disabled={loggingIn}>
            Continue without an account
          </button>
          <p className="fine" style={{ textAlign: 'center', marginTop: 8 }}>
            A simple version: Records, Categories and Accounts, with data kept on this device only. Sign in with Google for budgets, EMIs, loans, reminders and group expenses.
          </p>
          {!hasClientId() && (
            <p className="err">Setup needed: add VITE_GOOGLE_CLIENT_ID to your .env file (see README).</p>
          )}
          {error && <p className="err" role="alert">{error}</p>}
          <p className="fine" style={{ textAlign: 'center' }}>
            PocketZen only accesses its own hidden app folder in your Drive. You stay signed in until you log out.
          </p>
        </div>
        </div>
      </div>
    </div>
  )
}
