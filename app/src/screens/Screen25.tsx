import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { cancelAppointment, saveAppointment } from '../store/actions'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { Btn, Chip, Err, InputBox, NoteArea, PlusIcon, ScrollArea, Tap, TextInput } from '../ui/kit'
import { SheetTitle } from '../ui/Overlays'
import { useNow } from '../ui/useNow'
import { dayName, fmtTime, fromLocalInput, monthShort, toLocalInput, tzParts } from '../domain/time'
import { Section } from '../ui/homeparts'
import type { Appointment } from '../domain/types'

const REMINDERS: Array<[Appointment['reminder'], string]> = [['none', 'No reminder'], ['1h', '1 hour before'], ['1d', '1 day before'], ['evening_before', 'Evening before']]

const dayLine = (iso: string, tz: string) => { const p = tzParts(new Date(iso), tz); return `${dayName(p.dow)}, ${p.d} ${monthShort(p.m)} · ${fmtTime(iso, tz)}` }

function AppointmentSheet({ id }: { id?: string }) {
  const { closeSheet, toast, confirm } = useApp()
  const tz = useStore((s) => s.profile.timeZone)
  const existing = useStore((s) => s.appointments.find((a) => a.id === id))
  const [title, setTitle] = useState(existing?.title ?? '')
  const [doctor, setDoctor] = useState(existing?.doctor ?? '')
  const [when, setWhen] = useState(existing ? toLocalInput(existing.at, tz) : '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [reminder, setReminder] = useState<Appointment['reminder']>(existing?.reminder ?? '1d')
  const [errors, setErrors] = useState<{ title?: string; when?: string }>({})
  const save = () => {
    const e: typeof errors = {}
    if (!title.trim()) e.title = 'Enter a title, for example "Checkup".'
    const d = fromLocalInput(when, tz)
    if (!d) e.when = 'Choose a date and time.'
    setErrors(e)
    if (Object.keys(e).length || !d) return
    const r = saveAppointment({ id, title, doctor, at: d, notes, reminder })
    if (!r.ok) { setErrors({ when: r.error }); return }
    toast(existing ? 'Appointment updated.' : 'Appointment added.', 'success'); closeSheet()
  }
  return (
    <div>
      <SheetTitle sub="Sathi will remind you before it.">{existing ? 'Edit appointment' : 'New appointment'}</SheetTitle>
      <label className="lbl" htmlFor="ap-title" style={{ display: 'block', marginTop: 0 }}>WHAT</label>
      <InputBox style={{ marginTop: 8 }} invalid={!!errors.title}><TextInput id="ap-title" value={title} placeholder="e.g. Checkup" onChange={(e) => setTitle(e.target.value)} /></InputBox>
      <Err>{errors.title}</Err>
      <label className="lbl" htmlFor="ap-doc" style={{ display: 'block' }}>DOCTOR OR PLACE (OPTIONAL)</label>
      <InputBox style={{ marginTop: 8 }}><TextInput id="ap-doc" value={doctor} placeholder="e.g. Dr. Sharma" onChange={(e) => setDoctor(e.target.value)} /></InputBox>
      <label className="lbl" htmlFor="ap-when" style={{ display: 'block' }}>DATE &amp; TIME</label>
      <InputBox style={{ marginTop: 8 }} invalid={!!errors.when}><input id="ap-when" type="datetime-local" className="fi" value={when} onChange={(e) => { setErrors({}); setWhen(e.target.value) }} /></InputBox>
      <Err>{errors.when}</Err>
      <div className="lbl">REMINDER</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>{REMINDERS.map(([k, l]) => <Chip key={k} on={reminder === k} onClick={() => setReminder(k)}>{l}</Chip>)}</div>
      <label className="lbl" htmlFor="ap-notes" style={{ display: 'block' }}>NOTES (OPTIONAL)</label>
      <NoteArea id="ap-notes" h={56} value={notes} placeholder="e.g. Fasting required" onChange={(e) => setNotes(e.target.value)} />
      <div style={{ marginTop: 16 }}><Btn kind="sg" onClick={save}>{existing ? 'Save changes' : 'Add appointment'}</Btn></div>
      {existing && existing.status === 'upcoming' && (
        <Tap style={{ marginTop: 14, textAlign: 'center', fontSize: 15, color: '#B75B53', fontWeight: 500 }} onClick={() => confirm({
          title: 'Cancel this appointment?', message: 'Its reminder will be cancelled too.', confirmLabel: 'Cancel appointment', cancelLabel: 'Keep it', danger: true,
          onConfirm: () => { cancelAppointment(existing.id); toast('Appointment cancelled.'); closeSheet() },
        })}>Cancel appointment</Tap>
      )}
    </div>
  )
}

export default function Screen25() {
  const { openSheet } = useApp()
  const n = useNow()
  const tz = useStore((s) => s.profile.timeZone)
  const all = useStore((s) => s.appointments)
  const reminders = useStore((s) => s.reminders)
  const upcoming = all.filter((a) => a.status === 'upcoming' && new Date(a.at).getTime() >= n.getTime()).sort((a, b) => a.at.localeCompare(b.at))
  const past = all.filter((a) => !upcoming.includes(a)).sort((a, b) => b.at.localeCompare(a.at))
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sf" style={{ fontSize: 22 }}>Appointments</div>
          <Tap label="Add appointment" onClick={() => openSheet(<AppointmentSheet />)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PlusIcon /></Tap>
        </div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 4 }}>Sathi will remind you before each appointment.</div>
        <Section>Upcoming</Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {upcoming.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', lineHeight: 1.5 }}>No upcoming appointments. Tap + to add one.</div>}
          {upcoming.map((a) => {
            const rem = a.reminderId ? reminders.find((r) => r.id === a.reminderId) : undefined
            const accent = a.notes ? '#D98255' : '#526D51'
            return (
              <Tap key={a.id} className="crd" onClick={() => openSheet(<AppointmentSheet id={a.id} />)} style={{ display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${accent}` }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: a.notes ? '#F3D6C6' : '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {a.notes
                    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D98255" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                    : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{a.doctor ? `${a.doctor} · ${a.title}` : a.title}</div>
                  <div style={{ fontSize: 13, color: '#7A6B5D' }}>{dayLine(a.at, tz)}</div>
                  {a.notes && <div style={{ fontSize: 12, color: '#D98255', marginTop: 2 }}>{a.notes}</div>}
                  {rem && rem.status !== 'cancelled' && <div style={{ fontSize: 12, color: '#526D51', marginTop: 2 }}>Reminder set for {dayName(tzParts(new Date(rem.scheduledFor), tz).dow)}{tzParts(new Date(rem.scheduledFor), tz).h >= 17 ? ' evening' : ` at ${fmtTime(rem.scheduledFor, tz)}`}</div>}
                </div>
              </Tap>
            )
          })}
        </div>
        {past.length > 0 && <Section mt={28}>Past</Section>}
        {past.map((a) => (
          <Tap key={a.id} onClick={() => openSheet(<AppointmentSheet id={a.id} />)} style={{ marginTop: 10, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, opacity: 0.6 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F8F4EC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A7F6A" strokeWidth="1.5"><path d="M5 12l5 5L20 7" /></svg></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500, textDecoration: a.status === 'cancelled' ? 'line-through' : undefined }}>{a.doctor ? `${a.doctor} · ${a.title}` : a.title}</div><div style={{ fontSize: 13, color: '#7A6B5D' }}>{(() => { const p = tzParts(new Date(a.at), tz); return `${p.d} ${monthShort(p.m)}` })()} · {a.status === 'cancelled' ? 'Cancelled' : a.status === 'completed' ? 'Completed' : 'Past'}</div></div>
          </Tap>
        ))}
      </ScrollArea>
      <BottomNav active="more" />
    </div>
  )
}
