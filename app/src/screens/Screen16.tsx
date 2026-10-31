import { useApp } from '../app/AppContext'
import { completeReminder } from '../store/actions'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { ScrollArea, Tap } from '../ui/kit'
import { FamilyMembers, HomeHeader, NotificationBanner } from '../ui/homeparts'
import { MedBubble } from '../ui/medcards'
import { useNow } from '../ui/useNow'
import { isToday } from '../domain/reminders'
import { fmtHMShort, fmtTime, pad, tzParts } from '../domain/time'
import { voice } from '../voice/session'
import { ReminderSheet } from '../ui/ReminderSheet'

export default function Screen16() {
  const { go, toast, openSheet } = useApp()
  const now = useNow()
  const s = useStore((x) => x)
  const tz = s.profile.timeZone
  const today = s.reminders.filter((r) => r.kind === 'medicine' && r.status !== 'cancelled' && isToday(r, now, tz)).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
  const missed = today.filter((r) => r.status === 'missed' || r.status === 'declined')
  const taken = today.filter((r) => r.status === 'completed').length
  const upcoming = today.filter((r) => r.status === 'scheduled' || r.status === 'snoozed' || r.status === 'ringing').length
  const first = missed[0]
  const label = (r: typeof today[number]) => {
    const med = s.medicines.find((m) => m.id === r.medicineId)
    const p = tzParts(new Date(r.scheduledFor), tz)
    return `${med?.name ?? r.title} · ${fmtHMShort(`${pad(p.h)}:${pad(p.min)}`)}`
  }
  const tries = (r: typeof today[number]) => r.deliveryAttempts.filter((a) => a.channel !== 'notification' && (a.outcome === 'delivered' || a.outcome === 'expired' || a.outcome === 'declined')).length
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <HomeHeader variant="greeting" now={now} />
        <NotificationBanner />
        <FamilyMembers now={now} />
        {first && (
          <div style={{ marginTop: 16, background: 'rgba(183,91,83,.08)', border: '1px solid rgba(183,91,83,.25)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B75B53" strokeWidth="1.5" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16v.5" /></svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Missed: {first.title.split(' ')[0]}, {fmtTime(first.scheduledFor, tz)}</div>
              <div style={{ fontSize: 12, color: '#7A6B5D', marginTop: 2 }}>{tries(first) > 0 ? `Sathi tried calling ${tries(first) === 1 ? 'once' : tries(first) === 2 ? 'twice' : `${tries(first)} times`}` : 'No answer was recorded'}</div>
            </div>
            <Tap onClick={() => { const r = completeReminder(first.id, 'manual'); toast(r.ok ? 'Marked as taken.' : r.error, r.ok ? 'success' : 'error') }}
              style={{ padding: '5px 10px', border: '1px solid #B75B53', borderRadius: 999, fontSize: 12, color: '#B75B53', fontWeight: 500, whiteSpace: 'nowrap' }}>Mark taken</Tap>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ padding: '5px 12px', background: '#E7EDE2', borderRadius: 999, fontSize: 13, color: '#526D51' }}>{taken} taken</div>
          <div style={{ padding: '5px 12px', background: 'rgba(183,91,83,.1)', borderRadius: 999, fontSize: 13, color: '#B75B53' }}>{missed.length} missed</div>
          <div style={{ padding: '5px 12px', border: '1px solid #E8DFD1', borderRadius: 999, fontSize: 13, color: '#7A6B5D' }}>{upcoming} upcoming</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {today.map((r) => {
            const med = s.medicines.find((m) => m.id === r.medicineId)
            const st = r.status === 'completed' ? ['#7B8B5A', `Taken at ${fmtTime(r.completedAt!, tz)}`] : r.status === 'missed' || r.status === 'declined' ? ['#B75B53', r.status === 'declined' ? 'Not answered — still needs attention' : 'Missed'] : ['#D98255', r.status === 'ringing' ? 'Due now' : 'Upcoming']
            return (
              <Tap key={r.id} className="crd" onClick={() => { if (r.status === 'ringing' || r.status === 'declined') { voice.ring(r.id); go('17', r.id) } else openSheet(<ReminderSheet id={r.id} />) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, boxShadow: `inset 3px 0 0 ${st[0]}` }}>
                {med ? <MedBubble med={med} size={40} icon={18} /> : <div style={{ width: 40, height: 40 }} />}
                <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{label(r)}</div><div style={{ fontSize: 12, color: st[0] }}>{st[1]}</div></div>
              </Tap>
            )
          })}
        </div>
      </ScrollArea>
      <BottomNav active="home" />
    </div>
  )
}
