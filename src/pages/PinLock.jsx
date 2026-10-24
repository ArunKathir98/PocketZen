import { useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useApp } from '../lib/store'
import { hashPin, verifyPin } from '../lib/pin'
import { reverifyAccount } from '../lib/google'
import PinPad from '../components/PinPad'
import { GoogleG, Logo } from '../components/ui'

export default function PinLock() {
  const { data, session, unlock, logout } = useApp()
  const [mode, setMode] = useState('enter') // enter | forgot
  const fails = useRef(0)
  const [wait, setWait] = useState(0)

  const check = async (pin) => {
    if (wait > 0) return false
    const ok = await verifyPin(pin, data.pin)
    if (ok) return unlock()
    fails.current += 1
    if (fails.current >= 5) {
      fails.current = 0
      let s = 30
      setWait(s)
      const t = setInterval(() => {
        s -= 1
        setWait(s)
        if (s <= 0) clearInterval(t)
      }, 1000)
    }
    return false
  }

  if (mode === 'forgot') return <ForgotPin onBack={() => setMode('enter')} />

  return (
    <div className="auth">
      <div className="auth-card">
        <Logo className="logo-lg" />
        <h1 style={{ fontSize: 28 }}>Pocket<span className="grad-text">Zen</span></h1>
        <p className="tag">Your Money. Your Control.</p>
        <p className="muted" style={{ marginTop: 18, fontWeight: 600 }}>
          {wait > 0 ? `Too many attempts. Try again in ${wait}s` : 'Enter your PIN to unlock'}
        </p>
        <PinPad onComplete={check} />
        <div className="row" style={{ justifyContent: 'center', marginTop: 22, gap: 18 }}>
          <button className="btn sm ghost" onClick={() => setMode('forgot')}>Forgot PIN?</button>
          <button className="btn sm ghost" onClick={() => confirm(`Log out ${session?.email}?`) && logout()}>Log out</button>
        </div>
      </div>
    </div>
  )
}

function ForgotPin({ onBack }) {
  const { session, setPin, unlock } = useApp()
  const [step, setStep] = useState('verify') // verify | new | confirm
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const first = useRef('')
  const [padKey, setPadKey] = useState(0)

  const verify = async () => {
    setErr('')
    setBusy(true)
    try {
      const ok = await reverifyAccount(session.sub, session.email)
      if (ok) setStep('new')
      else setErr(`Please sign in with ${session.email}.`)
    } catch (e) {
      setErr(/popup_closed|access_denied/.test(e.message) ? 'Sign-in was cancelled.' : `Couldn't verify (${e.message}).`)
    } finally {
      setBusy(false)
    }
  }

  const onPin = async (pin) => {
    if (step === 'new') {
      first.current = pin
      setStep('confirm')
      setPadKey((k) => k + 1)
      return true
    }
    if (pin !== first.current) {
      setErr('PINs did not match. Start again.')
      setStep('new')
      setPadKey((k) => k + 1)
      return false
    }
    setPin(await hashPin(pin))
    unlock()
    return true
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <Logo className="logo-lg" />
        <h1 style={{ fontSize: 30 }}>Reset PIN</h1>
        {step === 'verify' && (
          <>
            <p className="desc">Confirm it's you by signing in again with <b>{session?.email}</b>.</p>
            <button className="g-btn" onClick={verify} disabled={busy}>
              <GoogleG /> {busy ? 'Verifying…' : 'Verify with Google'}
            </button>
          </>
        )}
        {(step === 'new' || step === 'confirm') && (
          <>
            <p className="muted" style={{ marginTop: 14, fontWeight: 600 }}>{step === 'new' ? 'Choose a new 4-digit PIN' : 'Confirm your new PIN'}</p>
            <PinPad onComplete={onPin} resetKey={padKey} />
          </>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <div style={{ marginTop: 20 }}>
          <button className="btn ghost sm" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        </div>
      </div>
    </div>
  )
}
