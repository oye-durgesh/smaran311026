import { useApp } from '../app/AppContext'
import { getMedicine, setMedicinePaused } from '../store/actions'
import { useStore } from '../store/store'
import { Tap } from '../ui/kit'
import { MedBubble } from '../ui/medcards'
import { displayName, foodLabel, freqLabel, timesLabel } from '../domain/medicines'
import { greeting, monthShort } from '../domain/time'
import { useNow } from '../ui/useNow'
import { firstNameOf } from '../ui/homeparts'

export default function Screen29({ param }: { param?: string }) {
  const { back, go, toast } = useApp()
  const now = useNow()
  const profile = useStore((s) => s.profile)
  useStore((s) => s.medicines)
  const m = param ? getMedicine(param) : undefined
  const started = m?.startedOn ? (() => { const [y, mo, d] = m.startedOn.split('-').map(Number); return `${d} ${monthShort(mo)} ${y}` })() : 'Not started'
  const rows: Array<[string, string]> = m ? [
    ['Schedule', timesLabel(m) || 'Not set'], ['Frequency', freqLabel(m.frequency)], ['Food', foodLabel(m.food)],
    ['Duration', m.duration === 'course' ? `${m.courseDays} days` : 'Ongoing'], ['Started', started],
  ] : []
  const live = m && (m.status === 'active' || m.status === 'paused')
  return (
    <div className="scr" style={{ background: 'rgba(46,36,27,.35)' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, background: '#F5EFE6', opacity: 0.55, padding: 24, boxSizing: 'border-box' }}>
        <div className="sf" style={{ fontSize: 22, opacity: 0.9 }}>{greeting(now, profile.timeZone)}{firstNameOf(profile.name) ? `, ${firstNameOf(profile.name)}` : ''}</div>
      </div>
      <div onClick={back} aria-label="Close" role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Escape' && back()} style={{ position: 'absolute', inset: '0 0 75%' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#F5EFE6', borderRadius: '24px 24px 0 0', padding: '12px 24px 100px', boxSizing: 'border-box', height: '75%', overflow: 'auto' }}>
        <div style={{ width: 36, height: 4, background: '#E8DFD1', borderRadius: 2, margin: '0 auto 20px' }} />
        {!m ? <div style={{ fontSize: 15 }}>This medicine no longer exists.</div> : (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <MedBubble med={m} size={56} icon={28} />
              <div><div className="sf" style={{ fontSize: 22 }}>{displayName(m)}</div><div style={{ fontSize: 14, color: '#7A6B5D' }}>{m.purpose ? `For ${m.purpose}` : m.dose}</div></div>
            </div>
            <div className="sep" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gap: 12 }}><span style={{ fontSize: 14, color: '#7A6B5D' }}>{k}</span><span style={{ fontSize: 15, fontWeight: 500, textAlign: 'right' }}>{v}</span></div>)}
              {m.status === 'paused' && <div style={{ fontSize: 13, color: '#C08560' }}>Reminders are paused for this medicine.</div>}
              {!live && <div style={{ fontSize: 13, color: '#C08560' }}>{m.status === 'completed' ? 'This course is completed.' : 'Reminders are not active yet.'}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              <Tap onClick={() => go(live ? '32' : '11', m.id)} style={{ height: 48, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Edit schedule</Tap>
              {live && (
                <Tap onClick={() => { setMedicinePaused(m.id, m.status === 'active'); toast(m.status === 'active' ? 'Reminders paused.' : 'Reminders resumed.') }}
                  style={{ height: 48, background: '#fff', border: '1px solid rgba(183,91,83,.3)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#B75B53', fontWeight: 500 }}>{m.status === 'active' ? 'Pause reminders' : 'Resume reminders'}</Tap>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
