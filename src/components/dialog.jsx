import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'

const Ctx = createContext(null)

/**
 * In-app replacement for window.confirm / alert.
 *   const { confirm, alert, choose } = useDialog()
 *   if (await confirm({ title, message, confirmText, danger })) …
 *   const v = await choose({ title, message, actions: [{ label, value, variant }] })  // null when dismissed
 */
export const useDialog = () => useContext(Ctx)

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null)
  const resolver = useRef(null)

  const open = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setDlg(opts)
      }),
    [],
  )

  const close = useCallback((value) => {
    resolver.current?.(value)
    resolver.current = null
    setDlg(null)
  }, [])

  const api = useRef({
    confirm: (o) =>
      open({
        ...o,
        actions: [
          { label: o.cancelText || 'Cancel', value: false, variant: 'ghost' },
          { label: o.confirmText || 'Confirm', value: true, variant: o.danger ? 'danger-solid' : 'primary' },
        ],
      }).then((v) => v === true),
    alert: (o) => open({ ...o, actions: [{ label: o.okText || 'OK', value: true, variant: 'primary' }] }),
    choose: (o) => open(o).then((v) => (v === undefined ? null : v)),
  })

  useEffect(() => {
    if (!dlg) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        close(null)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [dlg, close])

  const danger = dlg?.danger
  const Icon = danger ? AlertTriangle : Info

  return (
    <Ctx.Provider value={api.current}>
      {children}
      {dlg && (
        <div className="scrim dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-m">
            <span className={`dlg-ico ${danger ? 'danger' : ''}`}><Icon size={22} /></span>
            <h2 id="dlg-t">{dlg.title || 'Are you sure?'}</h2>
            {dlg.message && <p id="dlg-m">{dlg.message}</p>}
            <div className="dlg-actions">
              {dlg.actions.map((a) => (
                <button
                  key={a.label}
                  autoFocus={a.variant === 'ghost' || dlg.actions.length === 1}
                  className={`btn ${a.variant === 'danger-solid' ? 'danger-solid' : a.variant || 'ghost'}`}
                  onClick={() => close(a.value)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
