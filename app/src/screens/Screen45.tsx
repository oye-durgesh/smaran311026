import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { Btn, CheckIcon, Tap } from '../ui/kit'
import { displayName } from '../domain/medicines'

export default function Screen45() {
  const { go } = useApp()
  const extraction = useStore((s) => s.setup.extraction)
  const meds = useStore((s) => s.medicines)
  const found = meds.filter((m) => m.extractionBatch && m.extractionBatch === extraction?.batchId && m.status !== 'removed')
  return (
    <div className="scr" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', boxSizing: 'border-box', height: 'calc(100% - 47px)' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(192,133,96,.1)', border: '1px solid rgba(192,133,96,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C08560" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M12 11v4M12 19h.01" /></svg>
      </div>
      <div className="sf" style={{ fontSize: 20, marginTop: 20, textAlign: 'center' }}>Partial extraction</div>
      <div style={{ fontSize: 14, color: '#7A6B5D', marginTop: 8, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>We found {found.length} medicine{found.length === 1 ? '' : 's'} but some text was unclear. You can review what we found and add the rest manually.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 20 }}>
        {found.map((m) => (
          <div key={m.id} style={{ background: '#fff', border: '1px solid #E8DFD1', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckIcon size={14} color="#7B8B5A" w={2} /><span style={{ fontSize: 14 }}>{displayName(m)}</span>
          </div>
        ))}
        <div style={{ background: '#fff', border: '1px dashed #C08560', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C08560" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg><span style={{ fontSize: 14, color: '#C08560' }}>{extraction?.isMock ? 'DEMO DATA — sample extraction, not a real file' : extraction?.warnings?.[0] ? extraction.warnings[0] : '1–2 medicines unclear'}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 20 }}>
        <Btn onClick={() => go('10')}>Review found medicines</Btn>
        <Tap onClick={() => go('08')} style={{ height: 48, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Retake photo</Tap>
      </div>
    </div>
  )
}
