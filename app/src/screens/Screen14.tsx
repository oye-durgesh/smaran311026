import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { CheckIcon, ChevRight, HeartIcon, MicIcon, ProgressRing, ScrollArea, Tap, WaveIcon } from '../ui/kit'
import { DemoBanner, FamilyMembers, HealthCards, HomeHeader, NotificationBanner, Section, nextReminder, startTalk, whenLabel, HelpLink } from '../ui/homeparts'
import { MedBubble } from '../ui/medcards'
import { useNow } from '../ui/useNow'
import { isToday } from '../domain/reminders'
import { foodLabel, periodOf } from '../domain/medicines'
import { fmtHM, fmtHMShort, tzParts, pad } from '../domain/time'
import { voice } from '../voice/session'
import { ReminderSheet } from '../ui/ReminderSheet'
import type { Reminder } from '../domain/types'

export default function Screen14() {
  const { go, openSheet } = useApp()
  const now = useNow()
  const s = useStore((x) => x)
  const tz = s.profile.timeZone
  const meds = s.medicines.filter((m) => m.status !== 'removed' && m.status !== 'completed')
  const confirmed = meds.filter((m) => m.status !== 'draft').length
  const draft = meds.find((m) => m.status === 'draft')
  const next = nextReminder(s.reminders)
  const today = s.reminders.filter((r) => r.kind === 'medicine' && r.status !== 'cancelled' && isToday(r, now, tz)).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))

  const tap = (r: Reminder) => {
    if (r.status === 'ringing' || r.status === 'declined') { voice.ring(r.id); go('17', r.id); return }
    if (r.status === 'completed') { go('29', r.medicineId); return }
    openSheet(<ReminderSheet id={r.id} />)
  }
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <HomeHeader variant="greeting-name" now={now} />
        <NotificationBanner />
        <DemoBanner />
        <FamilyMembers now={now} />
        <HealthCards now={now} />
        <Tap onClick={() => go('30')} style={{ marginTop: 16, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ProgressRing frac={meds.length ? confirmed / meds.length : 0} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{confirmed} of {meds.length} medicines confirmed</div>
            <div style={{ fontSize: 12, color: draft ? '#C08560' : '#526D51', marginTop: 2 }}>{draft ? `${draft.name || 'A medicine'} needs review` : 'All medicines confirmed'}</div>
          </div>
          <ChevRight />
        </Tap>
        <Tap onClick={() => startTalk(go)} style={{ marginTop: 12, background: 'linear-gradient(135deg,#ECE4EE,#E0D4E3)', border: '1px solid #D8CEDB', borderRadius: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#6F526C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><WaveIcon size={26} color="#fff" /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 500, color: '#2E241B' }}>Talk to Sathi</div><div style={{ fontSize: 13, color: '#6F526C', marginTop: 2 }}>Ask anything or record a reading</div></div>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#6F526C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MicIcon size={18} color="#fff" /></div>
        </Tap>
        <Tap onClick={() => go('46')} style={{ marginTop: 12, background: '#F3D6C6', borderRadius: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#D98255', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#8A6B5D', letterSpacing: '.06em' }}>NEXT REMINDER</div>
            <div style={{ fontSize: 17, fontWeight: 500, marginTop: 2 }}>{next ? next.title : 'Nothing scheduled'}</div>
            <div style={{ fontSize: 14, color: '#6B4F3D', marginTop: 2 }}>{next ? whenLabel(next, now, tz) : 'Add a medicine or reminder'}</div>
          </div>
        </Tap>
        <Section>Today's medicines</Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {today.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D' }}>No medicine reminders today.</div>}
          {today.map((r) => {
            const med = s.medicines.find((m) => m.id === r.medicineId)
            const done = r.status === 'completed'
            const late = r.status === 'missed'
            const due = r.status === 'ringing' || r.status === 'declined'
            const hm = (() => { const p = tzParts(new Date(r.scheduledFor), tz); return `${pad(p.h)}:${pad(p.min)}` })()
            return (
              <Tap key={r.id} className="crd" onClick={() => tap(r)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, boxShadow: `inset 3px 0 0 ${done ? '#7B8B5A' : late ? '#B75B53' : '#D98255'}` }}>
                {med ? <MedBubble med={med} size={40} icon={18} /> : <div style={{ width: 40, height: 40 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: '#7A6B5D' }}>{fmtHM(hm)} · {med?.food && med.food !== 'none' ? foodLabel(med.food) : periodOf(hm)}</div>
                </div>
                {done && <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#7B8B5A', fontSize: 12 }}><CheckIcon />Taken</div>}
                {!done && (
                  <div style={{ padding: '4px 10px', border: `1px solid ${late ? '#B75B53' : '#D98255'}`, borderRadius: 999, fontSize: 11, color: late ? '#B75B53' : '#D98255' }}>{late ? 'Missed' : due ? 'Due' : fmtHMShort(hm)}</div>
                )}
              </Tap>
            )
          })}
        </div>
        <Tap onClick={() => go('20')} style={{ marginTop: 16, background: '#ECE4EE', border: '1px solid #D8CEDB', borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#6F526C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><HeartIcon /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>Record a health reading</div><div style={{ fontSize: 12, color: '#6F526C' }}>Sugar, BP, or speak to Sathi</div></div>
          <ChevRight color="#6F526C" />
        </Tap>
        <HelpLink />
      </ScrollArea>
      <BottomNav active="home" />
    </div>
  )
}
