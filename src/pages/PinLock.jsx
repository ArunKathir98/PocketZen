import { useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useApp } from '../lib/store'
import { hashPin, verifyPin, verifyRecovery } from '../lib/pin'
import { reverifyAccount } from '../lib/google'
import PinPad from '../components/PinPad'
import { GoogleG, Logo } from '../components/ui'
import { useDialog } from '../components/dialog'

export default function PinLock() {
  const { data, session, isLocal, unlock, logout } = useApp()
  const { confirm } = useDialog()
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

  if (mode === 'forgot') return isLocal ? <LocalForgotPin onBack={() => setMode('enter')} /> : <ForgotPin onBack={() => setMode('enter')} />

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
          <button className="btn sm ghost" onClick={async () => (await confirm({ title: 'Log out?', message: `Sign out ${session?.email} on this device. Your data stays in Google Drive.`, confirmText: 'Log out', danger: true })) && logout()} hidden={isLocal}>Log out</button>
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

function LocalForgotPin({ onBack }) {
  const { data, setPin, unlock, logout } = useApp()
  const { choose } = useDialog()
  const [step, setStep] = useState('code') // code | new | confirm
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [padKey, setPadKey] = useState(0)
  const first = useRef('')
  const hasRecovery = !!data.pin?.recovery

  const verify = async (e) => {
    e.preventDefault()
    if (await verifyRecovery(code, data.pin.recovery)) {
      setErr('')
      setStep('new')
    } else setErr('That code does not match.')
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
    setPin({ ...(await hashPin(pin)), recovery: data.pin.recovery }) // the recovery code stays valid
    unlock()
    return true
  }

  const erase = async () => {
    const c = await choose({
      title: 'Erase everything?',
      message: 'This removes all PocketZen data from this device and cannot be undone. Only do this if you cannot find your recovery code and have no backup file.',
      danger: true,
      actions: [
        { label: 'Cancel', value: null, variant: 'ghost' },
        { label: 'Erase everything', value: 'erase', variant: 'danger-solid' },
      ],
    })
    if (c === 'erase') logout()
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <Logo className="logo-lg" />
        <h1 style={{ fontSize: 28 }}>Reset PIN</h1>
        {step === 'code' && (
          hasRecovery ? (
            <form onSubmit={verify} className="stack" style={{ marginTop: 14 }}>
              <p className="muted">Enter the recovery code you saved when you set your PIN.</p>
              <input className="input num" autoFocus placeholder="XXXX-XXXX-XXXX" value={code} autoCapitalize="characters" autoComplete="off"
                onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ textAlign: 'center', fontSize: 20, letterSpacing: 2, fontWeight: 800 }} />
              <button className="btn primary block" disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 12}>Verify code</button>
            </form>
          ) : (
            <p className="desc">This PIN was set without a recovery code, so it cannot be reset.</p>
          )
        )}
        {(step === 'new' || step === 'confirm') && (
          <>
            <p className="muted" style={{ marginTop: 14, fontWeight: 600 }}>{step === 'new' ? 'Choose a new 4-digit PIN' : 'Confirm your new PIN'}</p>
            <PinPad onComplete={onPin} resetKey={padKey} />
          </>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row" style={{ justifyContent: 'center', marginTop: 20, gap: 12, flexWrap: 'wrap' }}>
          <button className="btn ghost sm" onClick={onBack}><ArrowLeft size={16} /> Back</button>
          {step === 'code' && <button className="btn danger sm" onClick={erase}>I lost my code — erase data</button>}
        </div>
      </div>
    </div>
  )
}
