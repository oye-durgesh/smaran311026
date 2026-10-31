import { useState } from 'react'
import { useApp } from '../app/AppContext'
import * as A from '../store/actions'
import { now, useStore } from '../store/store'
import { Btn, Chip, Err, InputBox, NoteArea, TextInput, Tap, Toggle } from './kit'
import { SheetTitle } from './Overlays'
import { fmtDayTime, fromLocalInput, toLocalInput, fmtTime } from '../domain/time'
import { SNOOZE_OPTIONS, isOpen } from '../domain/reminders'
import type { Reminder } from '../domain/types'

const STATUS_LABEL: Record<Reminder['status'], string> = {
  scheduled: 'Scheduled', ringing: 'Due now', snoozed: 'Snoozed', completed: 'Completed', missed: 'Missed', cancelled: 'Cancelled', declined: 'Needs attention', skipped: 'Skipped',
}

/** Everything you can do to one reminder: edit, snooze 5/10/15, reschedule, mark done, cancel — plus its history. */
export function ReminderSheet({ id }: { id: string }) {
  const { closeSheet, toast, confirm } = useApp()
  const r = useStore((s) => s.reminders.find((x) => x.id === id))
  const tz = useStore((s) => s.profile.timeZone)
  const [title, setTitle] = useState(r?.title ?? '')
  const [notes, setNotes] = useState(r?.notes ?? '')
  const [when, setWhen] = useState(r ? toLocalInput(r.scheduledFor, tz) : '')
  const [err, setErr] = useState<string>()
  if (!r) return <div>This reminder no longer exists.</div>
  const open = isOpen(r)
  const n = now()
  const done = (res: A.Result<unknown>, ok: string) => { if (res.ok) { toast(ok, 'success'); closeSheet() } else setErr(res.error) }

  return (
    <div>
      <SheetTitle sub={`${STATUS_LABEL[r.status]} · ${fmtDayTime(r.scheduledFor, n, tz)}${r.recurrence ? ' · repeats daily' : ''}`}>{r.kind === 'medicine' ? r.title : 'Reminder'}</SheetTitle>
      {open && r.kind !== 'medicine' && (
        <>
          <label className="lbl" htmlFor="rs-title" style={{ display: 'block', marginTop: 4 }}>WHAT</label>
          <InputBox style={{ marginTop: 8 }}><TextInput id="rs-title" value={title} onChange={(e) => setTitle(e.target.value)} /></InputBox>
          <label className="lbl" htmlFor="rs-notes" style={{ display: 'block' }}>NOTES (OPTIONAL)</label>
          <NoteArea id="rs-notes" h={56} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div style={{ marginTop: 10 }}><Btn kind="sg" onClick={() => done(A.editReminder(r.id, { title, notes }), 'Reminder updated.')}>Save changes</Btn></div>
        </>
      )}
      {open && (
        <>
          {r.status !== 'completed' && (
            <div style={{ marginTop: 16 }}><Btn kind="sg" onClick={() => done(A.completeReminder(r.id, 'manual'), r.kind === 'medicine' ? 'Marked as taken.' : 'Marked as done.')}>{r.kind === 'medicine' ? 'Mark taken' : 'Mark done'}</Btn></div>
          )}
          {r.kind === 'medicine' && (
            <Tap style={{ marginTop: 14, textAlign: 'center', fontSize: 14, color: '#7A6B5D', fontWeight: 500 }} onClick={() => confirm({
              title: 'Skip this dose?', message: 'It will be recorded as skipped. Please do not take an extra dose later. If you are unsure what to do about a missed dose, check the prescription or ask your doctor or pharmacist.', confirmLabel: 'Skip this dose',
              onConfirm: () => { A.skipReminder(r.id); toast('Dose recorded as skipped.'); closeSheet() },
            })}>Skip this dose</Tap>
          )}
          <div className="lbl">SNOOZE</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {SNOOZE_OPTIONS.map((m) => <Chip key={m} on={false} onClick={() => done(A.snoozeReminder(r.id, m), `Snoozed for ${m} minutes.`)}>{m} min</Chip>)}
          </div>
          <label className="lbl" htmlFor="rs-when" style={{ display: 'block' }}>RESCHEDULE TO</label>
          <InputBox style={{ marginTop: 10 }}><input id="rs-when" type="datetime-local" className="fi" value={when} onChange={(e) => { setErr(undefined); setWhen(e.target.value) }} /></InputBox>
          <div style={{ marginTop: 10 }}>
            <Btn onClick={() => {
              const d = fromLocalInput(when, tz)
              if (!d) { setErr('Choose a date and time.'); return }
              done(A.rescheduleReminder(r.id, d), 'Reminder rescheduled.')
            }}>Reschedule</Btn>
          </div>
          <Err>{err}</Err>
          {r.status !== 'ringing' && (
            <Tap style={{ marginTop: 16, textAlign: 'center', fontSize: 15, color: '#B75B53', fontWeight: 500 }} onClick={() => confirm({
              title: 'Cancel this reminder?', message: r.recurrence ? 'Only this one will be cancelled. Tomorrow’s reminder stays.' : 'It will move to your cancelled list.', confirmLabel: 'Cancel reminder', cancelLabel: 'Keep it', danger: true,
              onConfirm: () => { A.cancelReminder(r.id); toast('Reminder cancelled.'); closeSheet() },
            })}>Cancel reminder</Tap>
          )}
        </>
      )}
      {r.status === 'missed' && <Err>This reminder was missed. You can still mark it taken or move it to a new time.</Err>}
      {(r.snoozeHistory.length > 0 || r.rescheduleHistory.length > 0 || r.deliveryAttempts.length > 0) && (
        <>
          <div className="lbl">HISTORY</div>
          <div style={{ fontSize: 12, color: '#7A6B5D', marginTop: 8, lineHeight: 1.6 }}>
            {r.snoozeHistory.map((h, i) => <div key={`s${i}`}>Snoozed {h.minutes} min at {fmtTime(h.at, tz)}</div>)}
            {r.rescheduleHistory.map((h, i) => <div key={`r${i}`}>Rescheduled at {fmtTime(h.at, tz)} → {fmtDayTime(h.to, n, tz)}</div>)}
            {r.deliveryAttempts.map((h, i) => <div key={`d${i}`}>{h.channel} · {h.outcome} at {fmtTime(h.at, tz)}</div>)}
            {r.completedAt && <div>Completed at {fmtTime(r.completedAt, tz)} ({r.completion?.basis === 'user-reported' ? 'reported by you' : ''})</div>}
          </div>
          <div style={{ fontSize: 11, color: '#A89584', marginTop: 6 }}>A delivered notification is not proof that a medicine was taken.</div>
        </>
      )}
    </div>
  )
}

export function NewReminderSheet() {
  const { closeSheet, toast } = useApp()
  const tz = useStore((s) => s.profile.timeZone)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState('')
  const [daily, setDaily] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; when?: string }>({})
  const save = () => {
    const e: typeof errors = {}
    if (!title.trim()) e.title = 'Enter what to remind you about.'
    const d = fromLocalInput(when, tz)
    if (!d) e.when = 'Choose a date and time.'
    else if (d.getTime() <= now().getTime()) e.when = 'Choose a time in the future.'
    setErrors(e)
    if (Object.keys(e).length || !d) return
    if (daily) {
      const hm = when.slice(11, 16)
      const res = A.createDailySeries(title, hm, notes)
      if (!res.ok) { setErrors({ title: res.error }); return }
      toast('Daily reminder created.', 'success')
    } else {
      const res = A.createReminder({ title, when: d, notes })
      if (!res.ok) { setErrors({ when: res.error }); return }
      toast(res.value.duplicate ? 'That reminder already exists.' : 'Reminder created.', 'success')
    }
    closeSheet()
  }
  return (
    <div>
      <SheetTitle sub="Sathi will ring you at this time.">New reminder</SheetTitle>
      <label className="lbl" htmlFor="nr-title" style={{ display: 'block', marginTop: 0 }}>WHAT</label>
      <InputBox style={{ marginTop: 8 }} invalid={!!errors.title}><TextInput id="nr-title" value={title} placeholder="e.g. Call the doctor" onChange={(e) => setTitle(e.target.value)} /></InputBox>
      <Err>{errors.title}</Err>
      <label className="lbl" htmlFor="nr-when" style={{ display: 'block' }}>WHEN</label>
      <InputBox style={{ marginTop: 8 }} invalid={!!errors.when}><input id="nr-when" type="datetime-local" className="fi" value={when} onChange={(e) => setWhen(e.target.value)} /></InputBox>
      <Err>{errors.when}</Err>
      <label className="lbl" htmlFor="nr-notes" style={{ display: 'block' }}>NOTES (OPTIONAL)</label>
      <NoteArea id="nr-notes" h={56} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <span style={{ fontSize: 15 }}>Repeat every day at this time</span><Toggle on={daily} onChange={setDaily} label="Repeat every day" />
      </div>
      <div style={{ marginTop: 16 }}><Btn kind="sg" onClick={save}>Create reminder</Btn></div>
    </div>
  )
}
