import { useEffect } from 'react'
import { useApp } from '../app/AppContext'
import { archivePerson, setActivePerson, updatePerson } from '../store/actions'
import { store, useStore } from '../store/store'
import { Chip, ScrollArea, Tap, Toggle } from '../ui/kit'
import { BottomNav } from '../ui/BottomNav'
import { Section, nextReminder, startTalk, whenLabel, HelpLink } from '../ui/homeparts'
import { PapaHome } from '../ui/papahome'
import { ReminderSheet } from '../ui/ReminderSheet'
import { useNow } from '../ui/useNow'
import { LANGS } from '../ui/options'
import { displayName } from '../domain/medicines'
import { activePerson, personLabel, relationshipName } from '../domain/people'
import { fmtDayTime, fmtTime } from '../domain/time'
import { estimateStock, stockAlerts } from '../domain/inventory'
import { StockSheet } from '../ui/StockSheet'
import type { Lang, Reminder } from '../domain/types'

const STATUS: Record<Reminder['status'], string> = { scheduled: 'Scheduled', ringing: 'Due now', snoozed: 'Snoozed', completed: 'Done', missed: 'Missed', cancelled: 'Cancelled', declined: 'Not now', skipped: 'Skipped' }

/** One family member's own page. Everything on it is scoped to that person: viewing it makes them the active profile. */
export default function Screen50({ param }: { param?: string }) {
  const { go, back, confirm, toast, openSheet } = useApp()
  const now = useNow()
  useEffect(() => { if (param && store.get().activePersonId !== param) setActivePerson(param) }, [param])
  const person = useStore((s) => activePerson(s))
  const meds = useStore((s) => s.medicines).filter((m) => m.status !== 'removed')
  const reminders = useStore((s) => s.reminders).filter((r) => r.status !== 'cancelled')
  const readings = useStore((s) => s.readings)
  const appts = useStore((s) => s.appointments).filter((a) => a.status === 'upcoming')
  if (!person || (param && person.id !== param)) return <div className="scr" style={{ padding: 24 }}>Loading…</div>
  const tz = person.timeZone
  const active = meds.filter((m) => m.status === 'active' || m.status === 'paused')
  const next = nextReminder(reminders)
  const upcoming = reminders.filter((r) => r.scheduledFor >= new Date(now.getTime() - 86400000).toISOString()).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).slice(0, 8)
  const lastSugar = readings.filter((r) => r.type === 'sugar').sort((a, b) => b.at.localeCompare(a.at))[0]
  const lastBp = readings.filter((r) => r.type === 'bp').sort((a, b) => b.at.localeCompare(a.at))[0]
  const card = { background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: '12px 16px' } as const
  const set = (p: Parameters<typeof updatePerson>[1]) => { const r = updatePerson(person.id, p); if (!r.ok) toast(r.error, 'error') }

  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <PapaHome person={person} now={now} reminders={reminders} meds={meds} readings={readings} appts={appts} allReminders={store.get().reminders} />

        {(() => {
          const alerts = stockAlerts(meds, store.get().reminders, now, personLabel(person))
          return alerts.length > 0 && (
            <div role="alert" style={{ ...card, marginTop: 12, background: 'rgba(192,133,96,.1)', border: '1px solid rgba(192,133,96,.25)', fontSize: 13, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {alerts.map((a) => <div key={a.medicineId}>{a.text}</div>)}
            </div>
          )
        })()}

        <Section>Reminders</Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {upcoming.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D' }}>No reminders yet. Add a medicine or ask Sathi to set one.</div>}
          {upcoming.map((r) => (
            <Tap key={r.id} onClick={() => openSheet(<ReminderSheet id={r.id} />)} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }} label={`${r.title}, ${STATUS[r.status]}`}>
              <div><div style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</div><div style={{ fontSize: 12, color: '#7A6B5D' }}>{whenLabel(r, now, tz)}</div></div>
              <span style={{ fontSize: 12, color: r.status === 'missed' ? '#B75B53' : '#526D51' }}>{STATUS[r.status]}</span>
            </Tap>
          ))}
        </div>

        <Section>Medicines</Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {meds.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D' }}>No medicines yet. Upload a prescription or add one.</div>}
          {meds.map((m) => {
            const e = estimateStock(m, store.get().reminders, now)
            const tone = e.level === 'out' || e.level === 'critical' ? '#B75B53' : e.level === 'low' ? '#C08560' : '#526D51'
            return (
              <div key={m.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <Tap onClick={() => go(m.status === 'draft' || m.status === 'confirmed' ? '11' : '29', m.id)} style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }} label={displayName(m)}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{displayName(m)}</span>
                  <span style={{ fontSize: 12, color: m.status === 'active' ? '#526D51' : '#C08560' }}>{m.status === 'draft' ? 'Needs review' : m.status === 'confirmed' ? 'Not started' : m.status === 'active' ? 'Active' : m.status}</span>
                </Tap>
                {m.status !== 'draft' && (
                  <Tap onClick={() => openSheet(<StockSheet medicineId={m.id} />)} label={`Update stock for ${displayName(m)}`}
                    style={{ padding: '8px 16px 12px', borderTop: '1px solid #F0EAE0', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                    <span style={{ color: e.tracked ? tone : '#8A7F6A' }}>{e.tracked ? `About ${e.onHand} ${e.unit}s${e.daysLeft != null ? ` · ${Math.floor(e.daysLeft)} days` : ''}${e.uncertain ? ' · estimate' : ''}` : 'Stock not tracked'}</span>
                    <span style={{ color: '#7B8B5A', fontWeight: 500 }}>{e.tracked ? 'Update stock' : 'Add stock'}</span>
                  </Tap>
                )}
              </div>
            )
          })}
        </div>

        <Section>Appointments &amp; follow-up</Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {appts.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D' }}>No appointments scheduled.</div>}
          {[...appts].sort((a, b) => a.at.localeCompare(b.at)).map((a) => (
            <Tap key={a.id} onClick={() => go('25')} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 8 }} label={a.title}>
              <div><div style={{ fontSize: 14, fontWeight: 500 }}>{a.title}</div><div style={{ fontSize: 12, color: '#7A6B5D' }}>{a.doctor ? `${a.doctor} · ` : ''}{fmtDayTime(a.at, now, tz)}</div></div>
              <span style={{ fontSize: 12, color: '#526D51' }}>{a.reminder === 'none' ? 'No reminder' : 'Reminder set'}</span>
            </Tap>
          ))}
          {meds.filter((m) => m.followUpDate).map((m) => <div key={m.id} style={{ ...card, fontSize: 13 }}>Follow-up from {displayName(m)}: {m.followUpDate}. <Tap style={{ display: 'inline', color: '#7B8B5A', fontWeight: 500 }} onClick={() => go('25')}>Set an appointment reminder</Tap></div>)}
          <Tap onClick={() => go('25')} style={{ fontSize: 14, color: '#7B8B5A', fontWeight: 500, textAlign: 'center', padding: 6 }}>+ Add or change appointments</Tap>
        </div>

        <Section>Health readings</Section>
        <Tap onClick={() => go('20')} style={{ ...card, marginTop: 10, fontSize: 14 }}>See {personLabel(person)}'s health history and add a reading</Tap>

        <Section>Settings for {personLabel(person)}</Section>
        <div className="lbl" style={{ marginTop: 10 }}>LANGUAGE</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {LANGS.map((l) => <Chip key={l.code} on={person.language === l.code} onClick={() => set({ language: l.code as Lang })}>{l.native}</Chip>)}
        </div>
        <div className="lbl">SPEAKING SPEED</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Chip on={person.speakingSpeed === 'normal'} onClick={() => set({ speakingSpeed: 'normal' })}>Normal</Chip>
          <Chip on={person.speakingSpeed === 'slower'} onClick={() => set({ speakingSpeed: 'slower' })}>Slower</Chip>
        </div>
        <div className="lbl">HOW SATHI ADDRESSES THEM</div>
        <input aria-label="Greeting name" className="fi" maxLength={40} value={person.greetingName} placeholder={relationshipName(person)} onChange={(e) => set({ greetingName: e.target.value })}
          style={{ marginTop: 8, width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid #E8DFD1', borderRadius: 12, background: '#fff' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <span style={{ fontSize: 15 }}>Reminder notifications</span>
          <Toggle on={person.notificationsEnabled} onChange={(v) => set({ notificationsEnabled: v })} label="Reminder notifications" />
        </div>
        <div className="lbl">SATHI'S VOICE</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {(['default', 'mom', 'dad'] as const).map((v) => <Chip key={v} on={person.sathiVoice === v} onClick={() => set({ sathiVoice: v })}>{v === 'default' ? 'Default' : v === 'mom' ? 'Mom' : 'Dad'}</Chip>)}
        </div>
        <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 8, lineHeight: 1.5 }}>Mummy and Papa use the voice set on their Sathi agent. Licensed voices do not need cloning consent; cloned voices do (Privacy &amp; data). If a voice is missing, Sathi uses the browser voice and says so — never someone else's voice.</div>

        {person.relationship !== 'self' && (
          <Tap onClick={() => confirm({ title: `Archive ${personLabel(person)}?`, message: 'Their medicines, reminders and records are kept. You can restore them later.', confirmLabel: 'Archive', danger: true, onConfirm: () => { archivePerson(person.id); toast('Archived.'); go('14', undefined, { replace: true }) } })}
            style={{ marginTop: 24, fontSize: 14, color: '#B75B53', fontWeight: 500, textAlign: 'center' }}>Archive this profile</Tap>
        )}
        <HelpLink />
      </ScrollArea>
      <BottomNav active="home" />
    </div>
  )
}
