import { LogIn, X } from 'lucide-react'
import { useApp } from '../lib/store'
import { Logo } from '../components/ui'
import GroupView from './GroupView'

/** A group opened from a view link by someone who has no PocketZen session. Read-only, no sign-in needed. */
export default function PublicGroup({ id, onClose }) {
  const { session } = useApp()
  return (
    <>
      <div className="ambient" />
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="banner install" style={{ marginBottom: 0 }}>
          <Logo className="logo-sm" alt="" />
          <span><b>PocketZen</b> · shared group</span>
          {!session && <button className="btn sm primary" onClick={() => onClose(true)}><LogIn size={14} /> Sign in to save</button>}
          <button className="icon-btn" style={{ width: 28, height: 28, marginLeft: session ? 'auto' : 0 }} onClick={() => onClose(false)} aria-label="Close"><X size={14} /></button>
        </div>
      </div>
      <GroupView entry={{ id, name: '', role: 'viewer', me: '' }} onBack={() => onClose(false)} publicMode />
    </>
  )
}
