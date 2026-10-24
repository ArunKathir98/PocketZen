import { useEffect, useState } from 'react'

// Registered at startup: `beforeinstallprompt` can fire before React mounts.
let deferred = null
const subs = new Set()
const emit = () => subs.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function useInstall() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick((n) => n + 1)
    subs.add(f)
    return () => subs.delete(f)
  }, [])
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    ios: isIOS() && !isStandalone(),
    prompt: async () => {
      if (!deferred) return
      deferred.prompt()
      await deferred.userChoice
      deferred = null
      emit()
    },
  }
}
