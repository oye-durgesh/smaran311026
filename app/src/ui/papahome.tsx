import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { completeReminder, skipReminder, snoozeReminder } from '../store/actions'
import { Tap, WaveIcon, MicIcon, ChevRight, CheckIcon, BackBtn } from './kit'
import { ReminderSheet } from './ReminderSheet'
import { nextReminder, startTalk, whenLabel } from './homeparts'
import { foodLabel } from '../domain/medicines'
import { estimateStock } from '../domain/inventory'
import { addressName, personLabel, relationshipName } from '../domain/people'
import { fmtDayRel, fmtDayTime, fmtLongDay, fmtTime } from '../domain/time'
import type { Appointment, Medicine, Person, Reading, Reminder } from '../domain/types'

const card = { background: '#fff', border: '1px solid #E8DFD1', borderRadius: 16 } as const
const lbl = { fontSize: 11, color: '#8A7F6A', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500 } as const

/** Approved Papa home design, filled only from this person's real records. Nothing is invented: absent data shows an empty state or nothing. */
export function PapaHome({ person, now, reminders, meds, readings, appts, allReminders }: {
  person: Person; now: Date; reminders: Reminder[]; meds: Medicine[]; readings: Reading[]; appts: Appointment[]; allReminders: Reminder[]
}) {
  const { go, back, toast, openSheet } = useApp()
  const tz = person.timeZone
  const label = personLabel(person)
  const hello = person.relationship === 'self' ? addressName(person) : person.greetingName.trim() || relationshipName(person)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  const today = reminders.filter((r) => fmtDayRel(r.scheduledFor, now, tz) === 'Today' || (r.completedAt && fmtDayRel(r.completedAt, now, tz) === 'Today'))
  const todayMeds = today.filter((r) => r.kind === 'medicine').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
  const taken = todayMeds.filter((r) => r.status === 'completed').length
  const due = reminders.filter((r) => r.status === 'ringing').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0]
  const missed = reminders.filter((r) => r.status === 'missed' && fmtDayRel(r.scheduledFor, now, tz) === 'Today').sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))[0]
  const next = nextReminder(reminders.filter((r) => r.id !== due?.id))
  const medOf = (r: Reminder) => (r.medicineId ? meds.find((m) => m.id === r.medicineId) : undefined)
  const stockLine = (r: Reminder) => { const m = medOf(r); if (!m) return ''; const e = estimateStock(m, allReminders, now); return e.tracked ? ` · ${e.onHand} ${e.unit}s left` : '' }
  const sugar = readings.filter((r) => r.type === 'sugar').sort((a, b) => b.at.localeCompare(a.at))[0]
  const bp = readings.filter((r) => r.type === 'bp').sort((a, b) => b.at.localeCompare(a.at))[0]
  const appt = [...appts].sort((a, b) => a.at.localeCompare(b.at))[0]
  const act = (fn: () => unknown, msg: string) => () => { try { fn(); toast(msg, 'success') } catch (e) { toast(e instanceof Error ? e.message : 'Could not update the reminder.', 'error') } }
  const open = (id: string) => openSheet(<ReminderSheet id={id} />)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackBtn onClick={back} />
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="sf" style={{ fontSize: 20, color: '#526D51' }}>{(label[0] ?? 'S').toUpperCase()}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sf" style={{ fontSize: 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Namaste, {hello}</div>
          <div style={{ fontSize: 12, color: '#7A6B5D' }}>{fmtLongDay(now, tz)} · {relationshipName(person)}</div>
        </div>
      </div>

      {!online && (
        <div role="status" style={{ marginTop: 16, background: 'rgba(192,133,96,.1)', border: '1px solid rgba(192,133,96,.25)', borderRadius: 14, padding: '12px 14px', fontSize: 13, lineHeight: 1.45 }}>
          <b style={{ fontWeight: 500 }}>You're offline.</b> Some features may not work. Reminders saved on this device still ring.
        </div>
      )}

      {/* Talk to Sathi */}
      <Tap onClick={() => online && startTalk(go)} label={`Talk to Sathi${online ? '' : ' (needs internet)'}`} style={{ marginTop: 16, borderRadius: 20, padding: '18px 16px', background: 'linear-gradient(135deg,#3A2E45,#2A2530)', display: 'flex', alignItems: 'center', gap: 14, opacity: online ? 1 : 0.6 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#E8DFD1,#B87D5A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: online ? 'orb-breathe 3s ease-in-out infinite' : 'none' }}><WaveIcon size={26} color="#fff" /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, color: '#F5EFE6' }}>Talk to Sathi</div>
          <div style={{ fontSize: 13, color: 'rgba(245,239,230,.7)', marginTop: 2 }}>{online ? `Ask about ${label}'s medicines and health` : 'Requires internet connection'}</div>
        </div>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MicIcon size={20} color="#F5EFE6" /></div>
      </Tap>

      {/* Due now */}
      {due && (
        <div role="alert" style={{ marginTop: 14, borderRadius: 18, padding: 16, background: 'linear-gradient(135deg,#D98255,#C47445)', color: '#fff' }}>
          <div style={{ fontSize: 11, letterSpacing: '.1em', opacity: 0.85 }}>REMINDER · NOW</div>
          <Tap onClick={() => open(due.id)} label={`Open ${due.title}`} style={{ marginTop: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{due.title}</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>{fmtTime(due.scheduledFor, tz)}{medOf(due)?.food && medOf(due)!.food !== 'none' ? ` · ${foodLabel(medOf(due)!.food)}` : ''}</div>
          </Tap>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Tap onClick={act(() => completeReminder(due.id, 'tap'), `${due.title} marked as taken`)} style={{ flex: 1.3, height: 44, borderRadius: 999, background: '#fff', color: '#C47445', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>Taken</Tap>
            <Tap onClick={act(() => skipReminder(due.id), 'Skipped')} style={{ flex: 1, height: 44, borderRadius: 999, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>Skip</Tap>
            <Tap onClick={act(() => snoozeReminder(due.id, 10), "Okay, I'll remind again in 10 minutes")} style={{ flex: 1, height: 44, borderRadius: 999, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>Later</Tap>
          </div>
        </div>
      )}

      {/* Missed today */}
      {missed && (
        <div role="alert" style={{ marginTop: 14, background: 'rgba(183,91,83,.06)', border: '1.5px solid rgba(183,91,83,.2)', borderRadius: 16, padding: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#B75B53' }}>Missed · {missed.title} {fmtTime(missed.scheduledFor, tz)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Tap onClick={act(() => completeReminder(missed.id, 'manual'), `${missed.title} marked as taken`)} style={{ flex: 1, height: 40, borderRadius: 999, background: '#526D51', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500 }}>Mark taken</Tap>
            <Tap onClick={act(() => skipReminder(missed.id), 'Marked as skipped')} style={{ flex: 1, height: 40, borderRadius: 999, background: '#fff', border: '1px solid #E8DFD1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500 }}>Skipped</Tap>
          </div>
        </div>
      )}

      {/* Next reminder */}
      {next && (
        <Tap onClick={() => open(next.id)} label={`Next reminder: ${next.title}`} style={{ marginTop: 14, borderRadius: 16, padding: 14, background: '#F3D6C6', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#D98255', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={lbl as React.CSSProperties}>Next reminder · {fmtTime(next.scheduledFor, tz)}</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginTop: 2 }}>{next.title}</div>
            <div style={{ fontSize: 12, color: '#7A6B5D', marginTop: 2 }}>{whenLabel(next, now, tz)}{stockLine(next)}</div>
          </div>
        </Tap>
      )}

      {/* Today's medicines */}
      {todayMeds.length > 0 && (
        <div style={{ ...card, marginTop: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="sf" style={{ fontSize: 17 }}>Today's medicines</div>
            <div style={{ fontSize: 12, color: '#7B8B5A', fontWeight: 500 }}>{taken} of {todayMeds.length} taken</div>
          </div>
          <div aria-hidden style={{ height: 6, borderRadius: 3, background: '#EFE7DA', marginTop: 10, overflow: 'hidden' }}><div style={{ width: `${(taken / todayMeds.length) * 100}%`, height: '100%', background: '#7B8B5A', transition: 'width .3s' }} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {todayMeds.map((r) => <MedRow key={r.id} r={r} tz={tz} onOpen={() => open(r.id)} />)}
          </div>
        </div>
      )}
      {todayMeds.length > 0 && taken === todayMeds.length && (
        <div role="status" style={{ marginTop: 12, background: '#E7EDE2', border: '1px solid #C4D4B8', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#526D51', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'check-pop .4s ease-out' }}><CheckIcon size={14} color="#fff" w={2.5} /></span>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#526D51' }}>All medicines taken today · {taken} of {todayMeds.length} confirmed</span>
        </div>
      )}

      {/* Latest readings */}
      <div style={{ ...lbl, marginTop: 22 } as React.CSSProperties}>Latest readings</div>
      {!sugar && !bp ? (
        <Tap onClick={() => go('20')} style={{ ...card, marginTop: 10, padding: '14px 16px', fontSize: 13, color: '#7A6B5D' }}>No readings recorded yet. Tap to add one.</Tap>
      ) : (
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <Reading label="Blood Sugar" dot="#D98255" tone="#C08560" onOpen={() => go('20')} value={sugar ? String(sugar.value) : undefined} unit={sugar?.unit} sub={sugar ? `${sugar.context && sugar.context !== 'unspecified' ? sugar.context.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()) + ' · ' : ''}${fmtDayTime(sugar.at, now, tz)}` : undefined} />
          <Reading label="Blood Pressure" dot="#6F526C" tone="#6F526C" onOpen={() => go('20')} value={bp ? `${bp.systolic}/${bp.diastolic}` : undefined} sub={bp ? fmtDayTime(bp.at, now, tz) : undefined} />
        </div>
      )}

      {/* Appointment */}
      {appt && (
        <Tap onClick={() => go('25')} label={appt.title} style={{ ...card, marginTop: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.6"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{appt.doctor ? `${appt.doctor} · ` : ''}{appt.title}</div>
            <div style={{ fontSize: 12, color: '#7A6B5D', marginTop: 2 }}>{fmtDayTime(appt.at, now, tz)}</div>
          </div>
          <ChevRight />
        </Tap>
      )}

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <Tap onClick={() => go('31')} style={{ flex: 1, height: 48, borderRadius: 14, background: '#E7EDE2', color: '#526D51', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500 }}>+ Add Medicine</Tap>
        <Tap onClick={() => go('08')} style={{ flex: 1, height: 48, borderRadius: 14, background: '#ECE4EE', color: '#6F526C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500 }}>Upload Rx</Tap>
      </div>
    </div>
  )
}

function MedRow({ r, tz, onOpen }: { r: Reminder; tz: string; onOpen: () => void }) {
  const done = r.status === 'completed', bad = r.status === 'missed', skipped = r.status === 'skipped'
  const stripe = done ? '#7B8B5A' : bad ? '#B75B53' : skipped ? '#A89584' : '#D98255'
  return (
    <Tap onClick={onOpen} label={`${r.title}, ${done ? 'taken' : bad ? 'missed' : skipped ? 'skipped' : 'upcoming'}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 10px', borderLeft: `3px solid ${stripe}`, borderRadius: 4, marginTop: 4 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#F3D6C6,#D98255)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
      {done ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#526D51' }}><CheckIcon size={14} color="#526D51" w={2.2} />{r.completedAt ? fmtTime(r.completedAt, tz) : 'Taken'}</span>
        : <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: bad ? 'rgba(183,91,83,.12)' : skipped ? '#EFE7DA' : 'rgba(217,130,85,.15)', color: bad ? '#B75B53' : skipped ? '#7A6B5D' : '#C08560' }}>{skipped ? 'Skipped' : bad ? 'Missed' : fmtTime(r.scheduledFor, tz)}</span>}
    </Tap>
  )
}

function Reading({ label, dot, tone, value, unit, sub, onOpen }: { label: string; dot: string; tone: string; value?: string; unit?: string; sub?: ReactNode; onOpen: () => void }) {
  return (
    <Tap onClick={onOpen} label={label} style={{ ...card, flex: 1, minWidth: 0, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7A6B5D' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />{label}</div>
      {value ? <><div style={{ marginTop: 8 }}><span style={{ fontSize: 24, fontWeight: 600 }}>{value}</span>{unit && <span style={{ fontSize: 12, color: '#7A6B5D', marginLeft: 4 }}>{unit}</span>}</div>
        <div style={{ fontSize: 11, color: tone, marginTop: 4 }}>{sub}</div></>
        : <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 10 }}>None yet</div>}
    </Tap>
  )
}
