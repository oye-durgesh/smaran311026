import type { ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { setActivePerson } from '../store/actions'
import { useRawStore } from '../store/store'
import { personLabel, relationshipName } from '../domain/people'
import { stockAlerts } from '../domain/inventory'
import { healthCard, trendText } from '../domain/healthcard'
import { Tap, WaveIcon } from './kit'
import { fmtDayTime, fmtLongDay, fmtTime, greeting, tzParts, fmtDayRel } from '../domain/time'
import { notificationPermission } from '../voice/speech'
import { voice } from '../voice/session'
import type { Reminder } from '../domain/types'
import { isActive } from '../domain/reminders'

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || ''

export function HomeHeader({ variant, now }: { variant: 'namaste' | 'greeting' | 'greeting-name'; now: Date }) {
  const { go } = useApp()
  const p = useRawStore((s) => s.profile)
  const first = firstNameOf(p.name)
  const title = variant === 'namaste' ? `Namaste${first ? ', ' + first : ''}` : variant === 'greeting-name' && first ? `${greeting(now, p.timeZone)}, ${first}` : greeting(now, p.timeZone)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><WaveIcon /></div>
        <div><div className="sf" style={{ fontSize: 20 }}>{title}</div><div style={{ fontSize: 12, color: '#7A6B5D' }}>{fmtLongDay(now, p.timeZone)}</div></div>
      </div>
      {variant === 'namaste'
        ? <Tap label="Settings" onClick={() => go('26')} style={{ display: 'flex' }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A6B5D" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg></Tap>
        : <Tap label="Profile and settings" onClick={() => go('26')} style={{ width: 36, height: 36, borderRadius: '50%', background: '#F8F4EC', border: '1px solid #E8DFD1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="sf" style={{ fontSize: 16, fontWeight: 500 }}>{(first[0] ?? 'S').toUpperCase()}</span></Tap>}
    </div>
  )
}

/** The amber "notifications are off" banner from the approved notifications-denied screen, shown on Home when relevant. */
export function NotificationBanner() {
  const { go } = useApp()
  if (notificationPermission() !== 'denied') return null
  return (
    <Tap onClick={() => go('48')} style={{ marginTop: 16, background: 'rgba(192,133,96,.1)', border: '1px solid rgba(192,133,96,.25)', borderRadius: 14, padding: 14, display: 'flex', gap: 12 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C08560" strokeWidth="1.5" style={{ flexShrink: 0, marginTop: 2 }}><path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" /><path d="M10 20a2 2 0 004 0" /><path d="M1 1l22 22" /></svg>
      <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>Notifications are off</div><div style={{ fontSize: 12, color: '#7A6B5D', marginTop: 2, lineHeight: 1.4 }}>Sathi can't remind you about medicines until notifications are allowed. Tap to fix.</div></div>
    </Tap>
  )
}

export const startTalk = (go: (n: string) => void) => { voice.startAssistant(); go('34') }

/** "Tonight at 10:00 PM" / "Tomorrow at 8:00 AM" */
export function whenLabel(r: Reminder, now: Date, tz: string): string {
  const rel = fmtDayRel(r.scheduledFor, now, tz)
  const h = tzParts(new Date(r.scheduledFor), tz).h
  if (rel === 'Today') return `${h >= 19 ? 'Tonight' : 'Today'} at ${fmtTime(r.scheduledFor, tz)}`
  return `${rel} at ${fmtTime(r.scheduledFor, tz)}`
}
export function nextReminder(reminders: Reminder[]): Reminder | undefined {
  return reminders.filter(isActive).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0]
}

export function Section({ children, mt = 24 }: { children: ReactNode; mt?: number }) {
  return <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: mt, fontWeight: 500 }}>{children}</div>
}

/** Home: one card per family member (shown only when the account manages more than just the owner). Each opens that person's own page. */
export function FamilyMembers({ now }: { now: Date }) {
  const { go } = useApp()
  const all = useRawStore((s) => s)
  const people = all.people.filter((p) => !p.archived)
  if (!people.some((p) => p.relationship !== 'self')) return null
  return (
    <div>
      <Section mt={20}>Family members</Section>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {people.map((p) => {
          const rems = all.reminders.filter((r) => (r.personId ?? '') === p.id)
          const next = nextReminder(rems)
          const pm = all.medicines.filter((m) => m.personId === p.id)
          const meds = pm.filter((m) => m.status === 'active' || m.status === 'paused').length
          const alert = stockAlerts(pm, all.reminders, now, personLabel(p))[0]
          return (
            <Tap key={p.id} label={`${personLabel(p)}, open profile`} onClick={() => { setActivePerson(p.id); go('50', p.id) }}
              style={{ background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#ECE4EE,#C4B0C2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="sf" style={{ fontSize: 16 }}>{(personLabel(p)[0] ?? '?').toUpperCase()}</span></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{personLabel(p)} <span style={{ fontSize: 12, color: '#8A7F6A', fontWeight: 400 }}>· {relationshipName(p)}</span></div>
                <div style={{ fontSize: 12, color: '#7A6B5D', marginTop: 2 }}>{next ? `Next: ${next.title} · ${whenLabel(next, now, p.timeZone)}` : 'No reminders yet'} · {meds} active medicine{meds === 1 ? '' : 's'}</div>
                {alert && <div style={{ fontSize: 12, color: alert.level === 'low' ? '#C08560' : '#B75B53', marginTop: 2 }}>{alert.level === 'out' ? 'Stock may have run out' : `Refill soon · about ${Math.floor(alert.daysLeft ?? 0)} days left`}</div>}
              </div>
            </Tap>
          )
        })}
        <Tap onClick={() => go('49', 'add')} style={{ fontSize: 14, color: '#7B8B5A', fontWeight: 500, textAlign: 'center', padding: 6 }}>+ Add a family member</Tap>
      </div>
    </div>
  )
}

const SUGAR_CTX: Record<string, string> = { fasting: 'fasting', before_meal: 'before a meal', after_meal: 'after a meal', random: 'random', unspecified: '' }
const SRC: Record<string, string> = { manual: 'entered by hand', voice: 'spoken to Sathi', sample: 'sample data' }
/** One health card per family member. Shows only recorded values with their date and source; empty states say so. */
export function HealthCards({ now }: { now: Date }) {
  const { go } = useApp()
  const all = useRawStore((s) => s)
  const people = all.people.filter((p) => !p.archived)
  if (!people.some((p) => p.relationship !== 'self')) return null
  return (
    <div>
      <Section mt={20}>Health cards</Section>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {people.map((p) => {
          const own = <T extends { personId?: string }>(l: T[]) => l.filter((x) => x.personId === p.id)
          const c = healthCard(own(all.readings), own(all.appointments), own(all.medicines), now)
          const when = (iso: string) => fmtDayTime(iso, now, p.timeZone)
          const line = (kind: 'sugar' | 'bp') => {
            const l = c[kind]
            if (!l) return <div style={{ color: '#8A7F6A' }}>{kind === 'sugar' ? 'No blood sugar reading recorded yet.' : 'No blood pressure reading recorded yet.'}</div>
            const r = l.reading
            const ctx = kind === 'sugar' ? SUGAR_CTX[r.context ?? 'unspecified'] : ''
            return (
              <div>
                <b>{kind === 'sugar' ? `${r.value} ${r.unit}` : `${r.systolic}/${r.diastolic} mmHg`}</b>
                <span style={{ color: '#7A6B5D' }}> · {when(r.at)}{ctx ? ` · ${ctx}` : ''} · {SRC[r.source] ?? r.source}</span>
                {l.stale && <div style={{ color: '#C08560', fontSize: 12 }}>Last recorded {l.ageDays} days ago. Not a current reading.</div>}
              </div>
            )
          }
          return (
            <Tap key={p.id} label={`${personLabel(p)}, health card`} onClick={() => { setActivePerson(p.id); go('20') }}
              style={{ background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: '12px 16px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{personLabel(p)}</div>
              <div><span style={{ color: '#8A7F6A' }}>Blood sugar</span>{line('sugar')}</div>
              <div><span style={{ color: '#8A7F6A' }}>Blood pressure</span>{line('bp')}</div>
              {c.sugarTrend.kind !== 'not_enough_data' && <div style={{ color: '#7A6B5D' }}>{trendText(c.sugarTrend, 'Blood sugar')}</div>}
              <div style={{ color: c.followUp ? '#2E241B' : '#8A7F6A' }}>{c.followUp ? `Follow-up: ${c.followUp.label} · ${c.followUp.source === 'appointment' ? when(c.followUp.at) : c.followUp.at}` : 'No follow-up scheduled'}</div>
            </Tap>
          )
        })}
      </div>
    </div>
  )
}

/** Always-available route to Help & support from the main screens. No phone number, no promise of a human agent. */
export function HelpLink() {
  const { go } = useApp()
  return <Tap label="Help and support" onClick={() => go('47')} style={{ marginTop: 20, marginBottom: 8, textAlign: 'center', fontSize: 13, color: '#7B8B5A', fontWeight: 500 }}>Help &amp; support</Tap>
}

/** Shown only while the synthetic demo family is loaded, so nobody mistakes it for real health information. */
export function DemoBanner() {
  const on = useRawStore((s) => !!s.demo.demoFamily)
  if (!on) return null
  return <div role="note" style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(111,82,108,.1)', border: '1px dashed #6F526C', fontSize: 12, color: '#6F526C', lineHeight: 1.4 }}>DEMO DATA. This family, names, readings and medicines are made up for exploring the app. Nothing here is saved to a server.</div>
}
