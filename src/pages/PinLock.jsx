import { useRef, useState } from 'react'
import { ArrowLeft, Mail } from 'lucide-react'
import { useApp } from '../lib/store'
import { hashPin, randomCode, verifyPin } from '../lib/pin'
import { sendEmailToSelf } from '../lib/google'
import PinPad from '../components/PinPad'
import { Logo } from '../components/ui'

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
        <h1 style={{ fontSize: 34 }}>Pocket<span className="grad-text">Zen</span></h1>
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
  const [step, setStep] = useState('send') // send | verify | new | confirm
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [code, setCode] = useState('')
  const sent = useRef(null) // { code, exp }
  const first = useRef('')
  const [padKey, setPadKey] = useState(0)

  const send = async () => {
    setErr('')
    setBusy(true)
    try {
      const c = randomCode()
      await sendEmailToSelf(
        session.email,
        'Your PocketZen PIN reset code',
        `Your PocketZen PIN reset code is ${c}.\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.\n\n— PocketZen · Your Money. Your Control.`,
      )
      sent.current = { code: c, exp: Date.now() + 10 * 60 * 1000 }
      setStep('verify')
    } catch (e) {
      setErr(`Couldn't send the email (${e.message}). Make sure you allow PocketZen to send email to yourself.`)
    } finally {
      setBusy(false)
    }
  }

  const verify = (e) => {
    e.preventDefault()
    if (!sent.current || Date.now() > sent.current.exp) return setErr('That code expired. Request a new one.')
    if (code.trim() !== sent.current.code) return setErr('Incorrect code.')
    setErr('')
    setStep('new')
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
        {step === 'send' && (
          <>
            <p className="desc">We'll email a 6-digit code to <b>{session?.email}</b>.</p>
            <button className="btn primary block" onClick={send} disabled={busy}>
              <Mail size={18} /> {busy ? 'Sending…' : 'Send code'}
            </button>
          </>
        )}
        {step === 'verify' && (
          <form onSubmit={verify} className="stack" style={{ marginTop: 18 }}>
            <p className="muted">Enter the code sent to {session?.email}</p>
            <input className="input num" inputMode="numeric" autoFocus maxLength={6} placeholder="000000" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ textAlign: 'center', fontSize: 26, letterSpacing: 8, fontWeight: 800 }} />
            <button className="btn primary block" disabled={code.length !== 6}>Verify</button>
            <button type="button" className="btn ghost sm" onClick={() => setStep('send')}>Resend code</button>
          </form>
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
