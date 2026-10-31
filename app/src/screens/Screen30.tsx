import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { ChevRight, ProgressRing, ScrollArea, Tap } from '../ui/kit'

export default function Screen30() {
  const { go } = useApp()
  const meds = useStore((s) => s.medicines).filter((m) => m.status !== 'removed')
  const done = meds.filter((m) => m.status !== 'draft').length
  const open = meds.length - done
  const opt = (color: string, bg: string, title: string, sub: string, icon: React.ReactNode, on: () => void) => (
    <Tap className="crd" onClick={on} style={{ display: 'flex', alignItems: 'center', gap: 14, borderLeft: `3px solid ${color}` }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div><div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 2 }}>{sub}</div></div>
      <ChevRight />
    </Tap>
  )
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <div className="sf" style={{ fontSize: 24 }}>Medicine Setup</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>Choose how to add your medicines.</div>
        {meds.length > 0 && (
          <div style={{ marginTop: 20, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ProgressRing frac={meds.length ? done / meds.length : 0} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{done} of {meds.length} confirmed</div>
                <div style={{ fontSize: 12, color: open ? '#C08560' : '#526D51' }}>{open ? `${open} medicine${open > 1 ? 's need' : ' needs'} review` : 'All medicines confirmed'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {meds.map((m) => (
                <Tap key={m.id} onClick={() => go(m.status === 'draft' || m.status === 'confirmed' ? '11' : '29', m.id)}
                  style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, ...(m.status === 'draft' ? { background: 'rgba(192,133,96,.12)', color: '#C08560' } : { background: '#E7EDE2', color: '#526D51' }) }}>
                  {m.name || 'Unnamed'} {m.status === 'draft' ? '⚠' : '✓'}
                </Tap>
              ))}
            </div>
          </div>
        )}
        <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 28, fontWeight: 500 }}>Add medicines</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {opt('#526D51', '#E7EDE2', 'Scan prescription', 'Photo or PDF of your prescription',
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>, () => go('08'))}
          {opt('#D98255', '#F3D6C6', 'Add manually', 'Enter medicine details yourself',
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D98255" strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg>, () => go('31'))}
          {opt('#6F526C', '#ECE4EE', 'Tell Sathi', 'Speak your medicine details aloud',
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6F526C" strokeWidth="1.5"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>, () => go('31', 'dictate'))}
        </div>
      </ScrollArea>
      <BottomNav active="medicines" />
    </div>
  )
}
