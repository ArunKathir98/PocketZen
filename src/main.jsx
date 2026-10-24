import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { AppProvider } from './lib/store'
import { DialogProvider } from './components/dialog'
import App from './App'
import './styles.css'
import './lib/install'
import { capturePendingJoin } from './lib/pendingJoin'

capturePendingJoin() // group links look like /?view=<group id>
import { unlockAudio } from './lib/notify'

// first tap unlocks audio so reminder chimes can play later
;['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, unlockAudio, { once: true }))

registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <DialogProvider>
        <App />
      </DialogProvider>
    </AppProvider>
  </StrictMode>,
)
