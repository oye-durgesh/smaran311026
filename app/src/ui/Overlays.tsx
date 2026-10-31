import { useEffect } from 'react'
import { useApp } from '../app/AppContext'
import { Tap } from './kit'

/** Overlays live inside the phone frame: toasts, confirmation dialogs and bottom sheets (styled like the approved medicine-detail sheet). */
export function Overlays() {
  const { toasts, confirmState, closeConfirm, sheet, closeSheet } = useApp()

  useEffect(() => {
    if (!sheet && !confirmState) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { confirmState ? closeConfirm() : closeSheet() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, confirmState, closeConfirm, closeSheet])

  return (
    <>
      {sheet && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
          <div onClick={closeSheet} style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.35)' }} />
          <div role="dialog" aria-modal="true" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#F5EFE6', borderRadius: '24px 24px 0 0', padding: '12px 24px 40px', boxSizing: 'border-box', maxHeight: '86%', overflow: 'auto' }}>
            <div style={{ width: 36, height: 4, background: '#E8DFD1', borderRadius: 2, margin: '0 auto 16px' }} />
            {sheet}
          </div>
        </div>
      )}
      {confirmState && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={closeConfirm} style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.45)' }} />
          <div role="alertdialog" aria-modal="true" aria-labelledby="cf-t" style={{ position: 'relative', width: '100%', background: '#F5EFE6', borderRadius: '24px 24px 0 0', padding: '20px 24px 36px', boxSizing: 'border-box' }}>
            <div id="cf-t" className="sf" style={{ fontSize: 22 }}>{confirmState.title}</div>
            {confirmState.message && <div style={{ fontSize: 14, color: '#7A6B5D', marginTop: 8, lineHeight: 1.5 }}>{confirmState.message}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              <Tap
                style={{ height: 52, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 500, ...(confirmState.danger ? { background: '#B75B53', color: '#fff' } : { background: '#2E241B', color: '#F5EFE6' }) }}
                onClick={() => { const c = confirmState; closeConfirm(); c.onConfirm() }}
              >{confirmState.confirmLabel ?? 'Confirm'}</Tap>
              <Tap
                style={{ height: 52, borderRadius: 999, background: '#fff', border: '1px solid #E8DFD1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 500 }}
                onClick={() => { const c = confirmState; closeConfirm(); c.onCancel?.() }}
              >{confirmState.cancelLabel ?? 'Cancel'}</Tap>
            </div>
          </div>
        </div>
      )}
      <div aria-live="polite" style={{ position: 'absolute', left: 16, right: 16, top: 56, zIndex: 40, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.4, boxShadow: '0 4px 16px rgba(0,0,0,.12)', background: t.kind === 'error' ? '#B75B53' : t.kind === 'success' ? '#526D51' : '#2E241B', color: '#fff' }}>{t.text}</div>
        ))}
      </div>
    </>
  )
}

/** Shared bottom-sheet content blocks. */
export function SheetTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="sf" style={{ fontSize: 22 }}>{children}</div>
      {sub && <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}
