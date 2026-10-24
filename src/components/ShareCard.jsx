import { Bug, Copy, MessageCircle, Share2 } from 'lucide-react'

const TEXT =
  'Try PocketZen — Your Money. Your Control.\nA free personal finance app (expenses, budgets, accounts, EMIs, bills) that keeps your data in your own Google Drive. Tell me what you think! 💬'
const FEEDBACK_URL = 'https://github.com/ArunKathir98/PocketZen/issues/new'

export default function ShareCard({ onMessage }) {
  const url = window.location.origin + '/'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${TEXT}\n${url}`)
      onMessage('Link copied — paste it in any chat.')
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
      await navigator.share({ title: 'PocketZen', text: TEXT, url, ...(files ? { files } : {}) })
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
      <a className="setting" href={`https://wa.me/?text=${encodeURIComponent(`${TEXT}\n${url}`)}`} target="_blank" rel="noreferrer">
        <span className="si"><MessageCircle size={19} /></span>
        <span className="main"><div className="t">Share on WhatsApp</div></span>
      </a>
      <button className="setting" onClick={copy}>
        <span className="si"><Copy size={19} /></span>
        <span className="main"><div className="t">Copy link</div><div className="s">{url.replace(/^https?:\/\//, '')}</div></span>
      </button>
      <a className="setting" href={FEEDBACK_URL} target="_blank" rel="noreferrer">
        <span className="si"><Bug size={19} /></span>
        <span className="main"><div className="t">Feedback &amp; bug reports</div><div className="s">Report an issue or ask for a feature</div></span>
      </a>
    </div>
  )
}
