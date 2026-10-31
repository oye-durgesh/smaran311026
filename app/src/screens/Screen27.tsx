import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { ScrollArea, Tap } from '../ui/kit'

export default function Screen27() {
  const { go } = useApp()
  const count = useStore((s) => s.readings.length)
  const [f, setF] = useState<'all' | 'sugar'>('all')
  useEffect(() => { if (count > 0) go('23', undefined, { replace: true }) }, [count, go])
  const pill = (on: boolean): React.CSSProperties => (on
    ? { padding: '6px 14px', background: '#2E241B', borderRadius: 999, fontSize: 13, color: '#F5EFE6', fontWeight: 500 }
    : { padding: '6px 14px', border: '1px solid #E8DFD1', borderRadius: 999, fontSize: 13, color: '#7A6B5D' })
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <div className="sf" style={{ fontSize: 22 }}>Health History</div>
        <div role="tablist" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Tap role="tab" aria-selected={f === 'all'} style={pill(f === 'all')} onClick={() => setF('all')}>All</Tap>
          <Tap role="tab" aria-selected={f === 'sugar'} style={pill(f === 'sugar')} onClick={() => setF('sugar')}>Blood Sugar</Tap>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F8F4EC', border: '1px solid #E8DFD1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C4BAA8" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
          </div>
          <div className="sf" style={{ fontSize: 20, marginTop: 20 }}>No readings yet</div>
          <div style={{ fontSize: 14, color: '#7A6B5D', marginTop: 8, lineHeight: 1.5, maxWidth: 260 }}>Your health history will appear here after you record your first reading.</div>
          <Tap onClick={() => go('20')} style={{ marginTop: 20, padding: '10px 24px', background: '#526D51', borderRadius: 999, color: '#fff', fontSize: 14, fontWeight: 500 }}>Record a reading</Tap>
        </div>
      </ScrollArea>
      <BottomNav active="health" />
    </div>
  )
}
