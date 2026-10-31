import { useApp } from '../app/AppContext'
import { getMedicine, removeMedicine, setMedicinePaused } from '../store/actions'
import { useStore } from '../store/store'
import { BackBtn, Btn, ScrollArea, Tap } from '../ui/kit'
import { displayName, foodLabel, freqLabel, timesLabel } from '../domain/medicines'

export default function Screen32({ param }: { param?: string }) {
  const { go, back, confirm, toast } = useApp()
  useStore((s) => s.medicines)
  const m = param ? getMedicine(param) : undefined
  if (!m || m.status === 'removed') return <div className="scr" style={{ background: '#F0EAE0', padding: 24 }}><BackBtn onClick={back} /><div style={{ marginTop: 20, fontSize: 15 }}>This medicine no longer exists.</div></div>
  const live = m.status === 'active' || m.status === 'paused'
  const rows: Array<[string, string]> = [
    ['Strength', m.strength || 'Not set'], ['Dose', m.dose || 'Not set'], ['Frequency', freqLabel(m.frequency)],
    ['Times', timesLabel(m) || 'Not set'], ['Food', foodLabel(m.food)], ['Duration', m.duration === 'course' ? `${m.courseDays} days` : 'Ongoing'],
  ]
  const remove = () => confirm({
    title: `Remove ${displayName(m)}?`, message: 'Its reminders will be cancelled. Past records are kept.', confirmLabel: 'Remove medicine', danger: true,
    onConfirm: () => { removeMedicine(m.id); toast('Medicine removed.'); go('15', undefined, { replace: true }) },
  })
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div><div style={{ fontSize: 13, color: '#8A7F6A' }}>Editing</div><div className="sf" style={{ fontSize: 20 }}>{displayName(m)}</div></div>
        </div>
        <div style={{ marginTop: 20, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: 14 }}>
          {rows.map(([k, v], i) => (
            <Tap key={k} onClick={() => go('11', m.id)} label={`Edit ${k}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', ...(i < rows.length - 1 ? { borderBottom: '1px solid #F0EBE0' } : {}) }}>
              <span style={{ fontSize: 14, color: '#7A6B5D' }}>{k}</span><span style={{ fontSize: 15, fontWeight: 500, textAlign: 'right' }}>{v}</span>
            </Tap>
          ))}
        </div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 12, textAlign: 'center' }}>Tap any field above to edit. Changes apply after confirmation.</div>
        <div className="sep" />
        <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>Actions</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <Tap onClick={() => go('11', m.id)} style={{ height: 48, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 500 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>Change reminder times
          </Tap>
          {live && (
            <Tap onClick={() => { setMedicinePaused(m.id, m.status === 'active'); toast(m.status === 'active' ? 'Reminders paused.' : 'Reminders resumed.') }}
              style={{ height: 48, background: 'rgba(192,133,96,.08)', border: '1px solid rgba(192,133,96,.3)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, color: '#C08560', fontWeight: 500 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C08560" strokeWidth="1.5"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>{m.status === 'active' ? 'Pause reminders' : 'Resume reminders'}
            </Tap>
          )}
          <Tap onClick={remove} style={{ height: 48, background: 'rgba(183,91,83,.06)', border: '1px solid rgba(183,91,83,.25)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, color: '#B75B53', fontWeight: 500 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B75B53" strokeWidth="1.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>Remove medicine
          </Tap>
        </div>
      </ScrollArea>
      <div className="ft"><Btn onClick={() => { toast('Saved.', 'success'); back() }}>Save changes</Btn></div>
    </div>
  )
}
