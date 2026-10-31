import { useState } from 'react'
import * as A from '../store/actions'
import { loadSample } from '../dev/sample'
import { removeDemoFamily, seedDemoFamily } from '../dev/demoFamily'
import { now, store, useStore } from '../store/store'
import { voicePersona } from '../domain/people'
import { fmtDayTime } from '../domain/time'
import { MISSED_AFTER_MIN } from '../domain/reminders'

/** Demo / deterministic-test controls. Separate from real scheduling: they only move the local clock and sample data. */
export function DevPanel() {
  const [open, setOpen] = useState(false)
  const demo = useStore((s) => s.demo)
  const full = useStore((s) => s)
  const reminders = useStore((s) => s.reminders)
  const tz = useStore((s) => s.profile.timeZone)
  const clock = fmtDayTime(now().toISOString(), now(), tz)
  const upcoming = reminders.filter((r) => r.status === 'scheduled' || r.status === 'snoozed').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))

  return (
    <details className="dev" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Demo &amp; test controls</summary>
      <p className="dev-note">Local test mode. Moving the clock only affects this browser; real scheduled delivery is done by the server dispatcher.</p>
      <div className="dev-row"><span>App clock</span><b data-testid="clock">{clock}{demo.clockOffsetMs ? ' (shifted)' : ''}</b></div>
      <div className="dev-btns">
        {[5, 10, 15, 60, 1440].map((m) => <button key={m} onClick={() => A.advanceClock(m)}>+{m >= 1440 ? '1 day' : m >= 60 ? '1 hour' : `${m} min`}</button>)}
        <button onClick={() => { A.resetClock(); A.tick() }}>Real time</button>
      </div>
      <div className="dev-btns">
        <button onClick={() => {
          const r = A.createReminder({ title: 'Test reminder', when: new Date(now().getTime() + 60000) })
          if (r.ok) A.triggerReminderNow(r.value.reminder.id)
        }}>Ring a test reminder now</button>
        <button disabled={!upcoming.length} onClick={() => upcoming[0] && A.triggerReminderNow(upcoming[0].id)}>Ring next reminder now</button>
      </div>
      <div className="dev-row"><span>Sathi voice</span>
        <select aria-label="Sathi voice" value={voicePersona(full)} onChange={(e) => A.setPersonVoice(full.activePersonId, e.target.value as 'default' | 'mom' | 'dad')}>
          <option value="default">Default</option><option value="mom">Mom</option><option value="dad">Dad / Papa</option>
        </select>
      </div>
      <div className="dev-row"><span>Mock prescription result</span>
        <select value={demo.extractionOutcome} onChange={(e) => store.set((s) => ({ ...s, demo: { ...s.demo, extractionOutcome: e.target.value as 'success' | 'partial' | 'error' } }))}>
          <option value="success">success</option><option value="partial">partial</option><option value="error">fails</option>
        </select>
      </div>
      <div className="dev-btns">
        <button onClick={() => { loadSample(); window.location.hash = '#14' }}>Load design sample data</button>
        <button onClick={() => { const r = seedDemoFamily(); if (r.ok) window.location.hash = '#14'; else window.alert(r.error) }}>Load demo family (Mummy &amp; Papa)</button>
        <button onClick={() => { void removeDemoFamily().then((r) => { if (r.ok) window.location.hash = '#01'; else window.alert(r.error) }) }}>Remove demo family</button>
        <button className="danger" onClick={() => { void A.wipeAll().then(() => { window.location.hash = '#01' }) }}>Reset all data</button>
      </div>
      <p className="dev-note">Reminders become "missed" {MISSED_AFTER_MIN} min after their time if unanswered.</p>
    </details>
  )
}
