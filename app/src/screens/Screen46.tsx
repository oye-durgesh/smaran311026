import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { HelpLink } from '../ui/homeparts'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { BackBtn, CheckIcon, PlusIcon, ScrollArea, Tap } from '../ui/kit'
import { useNow } from '../ui/useNow'
import { isToday, history } from '../domain/reminders'
import { fmtFullDay, fmtTime, fmtDayTime, tzParts, pad } from '../domain/time'
import { periodOf, foodLabel } from '../domain/medicines'
import { NewReminderSheet, ReminderSheet } from '../ui/ReminderSheet'
import type { Reminder } from '../domain/types'

export default function Screen46() {
  const { back, openSheet } = useApp()
  const now = useNow()
  const s = useStore((x) => x)
  const tz = s.profile.timeZone
  const [showHistory, setShowHistory] = useState(false)
  const today = s.reminders.filter((r) => r.status !== 'cancelled' && isToday(r, now, tz))
  // group by effective time of day
  const groups = new Map<string, Reminder[]>()
  for (const r of today) { const k = r.scheduledFor; groups.set(k, [...(groups.get(k) ?? []), r]) }
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  const past = history(s.reminders)

  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>Today's Reminders</div>
        </div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>{fmtFullDay(now, tz)}</div>
        {ordered.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', marginTop: 24, lineHeight: 1.5 }}>No reminders today.</div>}
        {ordered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24, paddingLeft: 20, borderLeft: '2px solid #E8DFD1' }}>
            {ordered.map(([key, rs]) => {
              const all = rs.every((r) => r.status === 'completed')
              const anyMissed = rs.some((r) => r.status === 'missed' || r.status === 'declined')
              const t = fmtTime(key, tz)
              const p = tzParts(new Date(key), tz)
              const hm = `${pad(p.h)}:${pad(p.min)}`
              const first = rs[0]
              const med = s.medicines.find((m) => m.id === first.medicineId)
              const sub = all ? `${first.kind === 'medicine' ? 'Taken' : 'Done'} at ${fmtTime(first.completedAt!, tz)}`
                : anyMissed ? 'Missed — tap to mark taken or reschedule'
                : rs.some((r) => r.status === 'ringing') ? 'Due now'
                : `${periodOf(hm)}${rs.length === 1 && med ? ` · ${med.food && med.food !== 'none' ? foodLabel(med.food) : 'No food instruction'}` : ''}`
              return (
                <Tap key={key} onClick={() => openSheet(<ReminderSheet id={first.id} />)} style={{ position: 'relative', paddingLeft: 20, paddingBottom: 24 }}>
                  <div style={{ position: 'absolute', left: -9, top: 2, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(all ? { background: '#7B8B5A' } : anyMissed ? { background: '#B75B53' } : { background: '#D98255', border: '2px solid #F3D6C6' }) }}>
                    {all && <CheckIcon size={8} color="#fff" w={3} />}
                  </div>
                  <div style={{ fontSize: 12, color: all ? '#7A6B5D' : anyMissed ? '#B75B53' : '#D98255', fontWeight: all ? 400 : 500 }}>{t}{all ? '' : anyMissed ? ' · Missed' : ' · Upcoming'}</div>
                  <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{rs.map((r) => r.title.replace(/ — .*/, '')).join(' · ')}</div>
                  <div style={{ fontSize: 13, color: all ? '#7B8B5A' : anyMissed ? '#B75B53' : '#7A6B5D', marginTop: 2 }}>{sub}</div>
                </Tap>
              )
            })}
          </div>
        )}
        <Tap onClick={() => openSheet(<NewReminderSheet />)} style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, color: '#7B8B5A', fontWeight: 500 }}>
          <PlusIcon size={16} color="#7B8B5A" />Add a reminder
        </Tap>
        <Tap onClick={() => setShowHistory((v) => !v)} style={{ marginTop: 16, textAlign: 'center', fontSize: 14, color: '#7A6B5D' }}>{showHistory ? 'Hide' : 'Show'} completed, missed &amp; cancelled ({past.length})</Tap>
        {showHistory && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {past.length === 0 && <div style={{ fontSize: 13, color: '#7A6B5D' }}>Nothing yet.</div>}
            {past.slice(0, 30).map((r) => (
              <Tap key={r.id} onClick={() => openSheet(<ReminderSheet id={r.id} />)} className="crd" style={{ padding: 12, opacity: 0.85 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.title.replace(/ — .*/, '')}</div>
                <div style={{ fontSize: 12, color: r.status === 'completed' ? '#7B8B5A' : r.status === 'missed' ? '#B75B53' : '#8A7F6A', marginTop: 2 }}>
                  {r.status[0].toUpperCase() + r.status.slice(1)} · {fmtDayTime(r.scheduledFor, now, tz)}
                </div>
              </Tap>
            ))}
          </div>
        )}
        <HelpLink />
      </ScrollArea>
      <BottomNav active="home" />
    </div>
  )
}

