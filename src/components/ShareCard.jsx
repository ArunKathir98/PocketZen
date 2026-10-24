import { Bug, Copy, MessageCircle, Share2 } from 'lucide-react'
import { FEEDBACK_FORM_URL } from '../config'

const message = (url) =>
  [
    'Hey! 👋 I built a small money app called *PocketZen* and I\'d love your honest feedback.',
    '',
    '💸 Track income, expenses & transfers',
    '🎯 Budgets, accounts, EMIs, loans, bill reminders',
    '🧾 Split group expenses with a view-only link for friends',
    '🔒 Your data stays in *your own Google Drive*, with no ads and no tracking',
    '',
    `👉 Try it here (free): ${url}`,
    '📲 On your phone, tap *Install* (or Share → Add to Home Screen on iPhone) to use it like an app.',
    '',
    'After you\'ve tried it for a few days, please tell me:',
    '1️⃣ What did you like?',
    '2️⃣ Anything confusing or broken?',
    '3️⃣ What feature should I add next?',
    '',
    ...(FEEDBACK_FORM_URL ? [`📝 Feedback form: ${FEEDBACK_FORM_URL}`] : ['Just reply here with screenshots if something looks off.']),
    'Thank you! 🙏',
  ].join('\n')

export default function ShareCard({ onMessage }) {
  const url = window.location.origin + '/'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message(url))
      onMessage('Message copied — paste it in any chat.')
    } catch {
      onMessage(`Copy this link: ${url}`)
    }
  }

  const share = async () => {
    if (!navigator.share) return copy()
    try {
      // attach the poster image where the device supports sharing files
      let files
      try {
        const blob = await (await fetch('/share-poster.jpg')).blob()
        const f = new File([blob], 'PocketZen.jpg', { type: 'image/jpeg' })
        if (navigator.canShare?.({ files: [f] })) files = [f]
      } catch { /* share without the image */ }
      await navigator.share({ title: 'PocketZen', text: message(url), ...(files ? { files } : {}) })
    } catch (e) {
      if (e?.name !== 'AbortError') copy()
    }
  }

  return (
    <div className="card list">
      <button className="setting" onClick={share}>
        <span className="si"><Share2 size={19} /></span>
        <span className="main"><div className="t">Share PocketZen</div><div className="s">Send the app and poster to friends &amp; family</div></span>
      </button>
      <a className="setting" href={`https://wa.me/?text=${encodeURIComponent(message(url))}`} target="_blank" rel="noreferrer">
        <span className="si"><MessageCircle size={19} /></span>
        <span className="main"><div className="t">Share on WhatsApp</div></span>
      </a>
      <button className="setting" onClick={copy}>
        <span className="si"><Copy size={19} /></span>
        <span className="main"><div className="t">Copy message</div><div className="s">{url.replace(/^https?:\/\//, '')}</div></span>
      </button>
      {FEEDBACK_FORM_URL && (
        <a className="setting" href={FEEDBACK_FORM_URL} target="_blank" rel="noreferrer">
          <span className="si"><Bug size={19} /></span>
          <span className="main"><div className="t">Feedback &amp; bug reports</div><div className="s">Tell us what to fix or add</div></span>
        </a>
      )}
    </div>
  )
}
