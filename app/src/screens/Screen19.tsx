import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { useVoice, voice } from '../voice/session'
import { Btn, CheckIcon, Tap } from '../ui/kit'
import { displayName } from '../domain/medicines'
import { fmtDayTime, fmtTime } from '../domain/time'
import { nextReminder } from '../ui/homeparts'
import { useNow } from '../ui/useNow'

const OUTCOME: Record<string, { title: string; status: string; color: string }> = {
  taken: { title: 'Call complete', status: 'Reported taken', color: '#526D51' },
  snoozed: { title: 'Reminder snoozed', status: 'Snoozed', color: '#C08560' },
  rescheduled: { title: 'Reminder rescheduled', status: 'Rescheduled', color: '#526D51' },
  created: { title: 'Reminder created', status: 'Created', color: '#526D51' },
  cancelled: { title: 'Reminder cancelled', status: 'Cancelled', color: '#7A6B5D' },
  'saved-reading': { title: 'Reading saved', status: 'Saved after your confirmation', color: '#526D51' },
  ended: { title: 'Call ended', status: 'Not confirmed', color: '#C08560' },
  declined: { title: 'Call ended', status: 'Not confirmed', color: '#C08560' },
}

export default function Screen19() {
  const { home, go } = useApp()
  const v = useVoice()
  const now = useNow()
  const s = useStore((x) => x)
  const tz = s.profile.timeZone
  const r = v.reminderId ? s.reminders.find((x) => x.id === v.reminderId) : undefined
  const med = r?.medicineId ? s.medicines.find((m) => m.id === r.medicineId) : undefined
  const o = OUTCOME[v.outcome ?? 'ended']
  const next = nextReminder(s.reminders.filter((x) => x.id !== r?.id || x.status === 'snoozed'))
  const nextText = next ? fmtDayTime(next.scheduledFor, now, tz).replace('Today, ', '') : 'None scheduled'
  const body = v.outcome === 'taken' ? `You reported taking your ${med?.name ?? r?.title ?? 'medicine'}. ${next ? `Your next reminder is at ${nextText}.` : ''}`
    : v.outcome === 'snoozed' && r ? `I'll remind you again at ${fmtTime(r.scheduledFor, tz)}.`
    : v.outcome === 'ended' || !v.outcome ? (r ? 'The call ended before you confirmed. Your reminder is still waiting for you.' : 'The conversation has ended.')
    : 'Done.'
  const finish = (to?: string) => { voice.reset(); to ? go(to) : home() }
  return (
    <div className="scr">
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 60% at 50% 20%,rgba(212,165,124,.4) 0%,rgba(196,184,206,.3) 40%,rgba(245,239,230,0) 75%)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 24px 100px', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ flex: 1 }} />
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckIcon size={36} color="#526D51" w={2} /></div>
        <div className="sf" style={{ fontSize: 24, marginTop: 20, textAlign: 'center' }}>{o.title}</div>
        <div style={{ fontSize: 15, color: '#7A6B5D', marginTop: 12, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>{body}</div>
        <div style={{ marginTop: 24, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: 14, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 12, color: '#8A7F6A', letterSpacing: '.08em' }}>SUMMARY</div>
          {r && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}><span style={{ fontSize: 14, color: '#7A6B5D' }}>{r.kind === 'medicine' ? 'Medicine' : 'Reminder'}</span><span style={{ fontSize: 14, fontWeight: 500 }}>{med ? displayName(med) : r.title}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: r ? 8 : 10 }}><span style={{ fontSize: 14, color: '#7A6B5D' }}>Status</span><span style={{ fontSize: 14, fontWeight: 500, color: o.color }}>{o.status}</span></div>
          {r?.completedAt && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}><span style={{ fontSize: 14, color: '#7A6B5D' }}>Time</span><span style={{ fontSize: 14, fontWeight: 500 }}>{fmtTime(r.completedAt, tz)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}><span style={{ fontSize: 14, color: '#7A6B5D' }}>Next reminder</span><span style={{ fontSize: 14, fontWeight: 500 }}>{nextText}</span></div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Btn onClick={() => finish()}>Done</Btn>
          <Tap style={{ fontSize: 14, color: '#7B8B5A', textAlign: 'center' }} onClick={() => finish('15')}>View medicines</Tap>
        </div>
      </div>
    </div>
  )
}
