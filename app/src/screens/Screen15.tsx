import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { ChevRight, PlusIcon, ScrollArea, Tap } from '../ui/kit'
import { MedBubble, listLine } from '../ui/medcards'
import { displayName, nextDoseFor } from '../domain/medicines'
import { fmtDayTime } from '../domain/time'
import { useNow } from '../ui/useNow'
import { Section, HelpLink } from '../ui/homeparts'

export default function Screen15() {
  const { go } = useApp()
  const now = useNow()
  const s = useStore((x) => x)
  const [tab, setTab] = useState<'active' | 'completed'>('active')
  const active = s.medicines.filter((m) => m.status === 'active' || m.status === 'paused')
  const pending = s.medicines.filter((m) => m.status === 'draft' || m.status === 'confirmed')
  const done = s.medicines.filter((m) => m.status === 'completed' || m.status === 'removed')
  const pill = (on: boolean): React.CSSProperties => (on
    ? { padding: '6px 14px', background: '#2E241B', borderRadius: 999, fontSize: 13, color: '#F5EFE6', fontWeight: 500 }
    : { padding: '6px 14px', border: '1px solid #E8DFD1', borderRadius: 999, fontSize: 13, color: '#7A6B5D' })
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sf" style={{ fontSize: 24 }}>Medicines</div>
          <Tap label="Add medicine" onClick={() => go('30')} style={{ width: 36, height: 36, borderRadius: '50%', background: '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PlusIcon /></Tap>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Tap role="tab" aria-selected={tab === 'active'} style={pill(tab === 'active')} onClick={() => setTab('active')}>Active · {active.length}</Tap>
          <Tap role="tab" aria-selected={tab === 'completed'} style={pill(tab === 'completed')} onClick={() => setTab('completed')}>Completed{done.length ? ` · ${done.length}` : ''}</Tap>
        </div>
        {tab === 'active' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {active.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', lineHeight: 1.5 }}>No active medicines yet. Add one to start your reminders.</div>}
              {active.map((m) => {
                const nx = nextDoseFor(m.id, s.reminders)
                return (
                  <Tap key={m.id} className="crd" onClick={() => go('29', m.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
                    <MedBubble med={m} size={44} icon={20} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 500 }}>{displayName(m)}</div>
                      <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 2 }}>{listLine(m)}</div>
                      <div style={{ fontSize: 12, color: m.status === 'paused' ? '#C08560' : '#7B8B5A', marginTop: 4 }}>{m.status === 'paused' ? 'Reminders paused' : nx ? `Next: ${fmtDayTime(nx.scheduledFor, now, s.profile.timeZone).replace(', ', ', ')}` : 'No upcoming reminder'}</div>
                    </div>
                    <ChevRight />
                  </Tap>
                )
              })}
            </div>
            {pending.length > 0 && (
              <>
                <Section mt={20}>Waiting for confirmation</Section>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {pending.map((m) => (
                    <Tap key={m.id} className="crd" onClick={() => go(m.status === 'draft' ? '11' : '12', m.status === 'draft' ? m.id : undefined)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderLeft: `3px solid ${m.status === 'draft' ? '#C08560' : '#7B8B5A'}` }}>
                      <MedBubble med={m} size={44} icon={20} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 500 }}>{displayName(m) || 'Unnamed medicine'}</div>
                        <div style={{ fontSize: 12, color: m.status === 'draft' ? '#C08560' : '#526D51', marginTop: 4 }}>{m.status === 'draft' ? 'Needs review' : 'Confirmed — not active yet'}</div>
                      </div>
                      <ChevRight />
                    </Tap>
                  ))}
                </div>
              </>
            )}
            <Tap onClick={() => go('08')} style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, color: '#7B8B5A', fontWeight: 500 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7B8B5A" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>Scan another prescription
            </Tap>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {done.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', lineHeight: 1.5 }}>Nothing here yet. Finished courses and stopped medicines will appear here.</div>}
            {done.map((m) => (
              <div key={m.id} className="crd" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, opacity: 0.75 }}>
                <MedBubble med={m} size={44} icon={20} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 500 }}>{displayName(m)}</div><div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 2 }}>{m.status === 'completed' ? 'Course completed' : 'Stopped'}</div></div>
              </div>
            ))}
          </div>
        )}
        <HelpLink />
      </ScrollArea>
      <BottomNav active="medicines" />
    </div>
  )
}
