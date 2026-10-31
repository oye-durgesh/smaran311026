import { useApp } from '../app/AppContext'
import { activateConfirmed } from '../store/actions'
import { useStore } from '../store/store'
import { BackBtn, Btn, CheckIcon, Err, ScrollArea, Tap } from '../ui/kit'
import { MedBubble, reminderCount, routineGroups, routineLine } from '../ui/medcards'
import { displayName } from '../domain/medicines'

export default function Screen12() {
  const { go, back, home, toast } = useApp()
  const meds = useStore((s) => s.medicines)
  const ready = meds.filter((m) => m.status === 'confirmed')
  const open = meds.filter((m) => m.status === 'draft')
  const groups = routineGroups(ready)

  const activate = () => {
    const r = activateConfirmed()
    if (!r.ok) { toast(r.error, 'error'); return }
    go('33', undefined, { replace: true })
  }
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <BackBtn onClick={back} />
        <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>Review your routine</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>{ready.length} medicine{ready.length === 1 ? '' : 's'} · {reminderCount(ready)} daily reminder{reminderCount(ready) === 1 ? '' : 's'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {ready.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', lineHeight: 1.5 }}>No confirmed medicines yet. Go back and confirm each medicine first.</div>}
          {ready.map((m) => (
            <Tap key={m.id} onClick={() => go('11', m.id)} label={`Edit ${displayName(m)}`} style={{ background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <MedBubble med={m} size={36} icon={16} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{displayName(m)}</div><div style={{ fontSize: 12, color: '#7A6B5D' }}>{routineLine(m)}</div></div>
              <CheckIcon size={14} color="#7B8B5A" w={2} />
            </Tap>
          ))}
        </div>
        {open.length > 0 && (
          <div style={{ marginTop: 12, background: 'rgba(192,133,96,.1)', border: '1px solid rgba(192,133,96,.3)', borderRadius: 14, padding: 14, fontSize: 13, color: '#7A6B5D', lineHeight: 1.5 }}>
            <b style={{ color: '#C08560' }}>{open.length} medicine{open.length > 1 ? 's' : ''} not confirmed yet</b> ({open.map((m) => m.name || 'unnamed').join(', ')}). They stay unconfirmed and will not get reminders.
            <Tap onClick={() => go('10')} style={{ marginTop: 6, color: '#7B8B5A', fontWeight: 500 }}>Review them</Tap>
          </div>
        )}
        <div className="sep" />
        <div style={{ fontSize: 13, fontWeight: 500 }}>Reminder schedule</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, fontSize: 13, color: '#7A6B5D' }}>
          {groups.map((g) => <div key={g.time} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{g.label}</span><span style={{ color: '#2E241B', textAlign: 'right' }}>{g.meds.map((m) => m.name).join(', ')}</span></div>)}
        </div>
        <Err>{ready.length === 0 ? 'Nothing to activate yet.' : undefined}</Err>
      </ScrollArea>
      <div className="ft"><div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Btn kind="sg" onClick={activate} disabled={ready.length === 0}>Confirm &amp; activate reminders</Btn>
        <Tap style={{ fontSize: 14, color: '#7A6B5D', textAlign: 'center' }} onClick={() => { toast('Saved. Your medicines stay unconfirmed until you activate them.'); home() }}>Save and finish later</Tap>
      </div></div>
    </div>
  )
}
