import { useCallback, useEffect, useRef, useState } from 'react'
import { Delete } from 'lucide-react'

/** 4-digit PIN entry. onComplete(pin) may return false (or reject) to signal a wrong PIN. */
export default function PinPad({ onComplete, length = 4, resetKey }) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const busy = useRef(false)

  useEffect(() => setPin(''), [resetKey])

  const press = useCallback(
    async (d) => {
      if (busy.current) return
      const next = (pin + d).slice(0, length)
      setPin(next)
      if (next.length === length) {
        busy.current = true
        let ok
        try {
          ok = await onComplete(next)
        } catch {
          ok = false
        }
        busy.current = false
        if (ok === false) {
          setShake(true)
          setTimeout(() => {
            setShake(false)
            setPin('')
          }, 380)
        } else setPin('')
      }
    },
    [pin, length, onComplete],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  return (
    <>
      <div className={`dots ${shake ? 'shake' : ''}`} aria-label={`${pin.length} of ${length} digits entered`}>
        {Array.from({ length }).map((_, i) => <i key={i} className={i < pin.length ? 'f' : ''} />)}
      </div>
      <div className="keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} className="key" onClick={() => press(String(n))}>{n}</button>
        ))}
        <span className="key blank" />
        <button className="key" onClick={() => press('0')}>0</button>
        <button className="key" aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))}><Delete size={24} /></button>
      </div>
    </>
  )
}
