/**
 * Family-member profiles. Pure functions (no store, no browser APIs).
 *  - A person's id is stable and independent of any name.
 *  - Every medicine / series / reminder / reading / appointment carries the personId it belongs to. The store stamps it on
 *    creation (derived from the medicine or series for reminders) and nothing ever moves a record to another person.
 *  - `scoped(state)` is the view the screens see: only the active person's records.
 */
import type { AppState, Person, Profile, Relationship } from './types'
import { newId } from './ids'

export const SELF_LOCAL_ID = 'self_local' // provisional id until the account exists; becomes `self_<auth uid>` on sign-in

export const relationshipName = (p: Pick<Person, 'relationship' | 'relationshipLabel'>): string =>
  p.relationship === 'mother' ? 'Mummy' : p.relationship === 'father' ? 'Papa' : p.relationship === 'self' ? 'Me' : p.relationshipLabel.trim()

/** What the app calls this person in lists: their name if set, otherwise their relationship. Never used as an identity. */
export const personLabel = (p: Person): string => p.displayName.trim() || relationshipName(p) || 'Family member'
/** What Sathi calls them when speaking to them. */
export const addressName = (p: Person): string => p.greetingName.trim() || p.displayName.trim() || relationshipName(p)

export function makeSelf(profile: Pick<Profile, 'name' | 'callName' | 'language' | 'timeZone' | 'speakingSpeed' | 'reminderTone'>, createdAt: string, id = SELF_LOCAL_ID): Person {
  return {
    id, relationship: 'self', relationshipLabel: '', displayName: profile.name, greetingName: profile.callName, language: profile.language,
    timeZone: profile.timeZone, speakingSpeed: profile.speakingSpeed, reminderTone: profile.reminderTone, sathiVoice: 'default',
    notificationsEnabled: true, archived: false, createdAt,
  }
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
/** The profile this (relationship, label) already maps to, so resuming or double-submitting onboarding never duplicates it. */
export function findExisting(people: Person[], relationship: Relationship, label: string): Person | undefined {
  if (relationship === 'self') return people.find((p) => p.relationship === 'self')
  const l = relationship === 'other' ? norm(label) : ''
  return people.find((p) => p.relationship === relationship && norm(p.relationshipLabel) === l)
}

export function selfOf(s: Pick<AppState, 'people'>): Person | undefined { return s.people.find((p) => p.relationship === 'self') }

export function activePerson(s: Pick<AppState, 'people' | 'activePersonId'>): Person | undefined {
  return s.people.find((p) => p.id === s.activePersonId && !p.archived) ?? s.people.find((p) => p.relationship === 'self') ?? s.people.find((p) => !p.archived)
}
export function activeId(s: Pick<AppState, 'people' | 'activePersonId'>): string { return activePerson(s)?.id ?? SELF_LOCAL_ID }

/** The settings Sathi and the app should use for the active person. The account holder's own settings come from their
 *  profile; a parent's come from the parent's record, falling back to the account defaults. */
export function effectiveSettings(s: Pick<AppState, 'people' | 'activePersonId' | 'profile'>, personId?: string) {
  const p = personId ? s.people.find((x) => x.id === personId) ?? activePerson(s) : activePerson(s)
  const isSelf = !p || p.relationship === 'self'
  return {
    personId: p?.id ?? SELF_LOCAL_ID,
    relationship: p?.relationship ?? 'self' as Relationship,
    label: p ? personLabel(p) : s.profile.name,
    address: isSelf ? (s.profile.callName || s.profile.name || 'friend') : (p ? addressName(p) : 'friend'),
    language: isSelf ? s.profile.language : p!.language,
    timeZone: isSelf ? s.profile.timeZone : p!.timeZone,
    speakingSpeed: isSelf ? s.profile.speakingSpeed : p!.speakingSpeed,
    reminderTone: isSelf ? s.profile.reminderTone : p!.reminderTone,
    notificationsEnabled: p?.notificationsEnabled ?? true,
  }
}

type Owned = { personId?: string }
const own = <T extends Owned>(list: T[], id: string, selfId: string) => list.filter((x) => (x.personId ?? selfId) === id)

const viewCache = new WeakMap<object, { active: string; view: AppState }>()
/** The active person's records only. Memoised per state object so React selectors stay referentially stable. */
export function scoped(s: AppState): AppState {
  const active = activeId(s)
  const hit = viewCache.get(s)
  if (hit && hit.active === active) return hit.view
  const selfId = selfOf(s)?.id ?? SELF_LOCAL_ID
  const view: AppState = {
    ...s,
    medicines: own(s.medicines, active, selfId), series: own(s.series, active, selfId), reminders: own(s.reminders, active, selfId),
    readings: own(s.readings, active, selfId), appointments: own(s.appointments, active, selfId),
  }
  viewCache.set(s, { active, view })
  return view
}

/** Give every new record its owner. Existing stamps are never changed. Reminders follow their medicine / series. */
export function stampPersons(next: AppState): AppState {
  const active = activeId(next)
  const needs = (l: Owned[]) => l.some((x) => !x.personId)
  if (![next.medicines, next.series, next.reminders, next.readings, next.appointments].some(needs)) return next
  const medP = new Map(next.medicines.map((m) => [m.id, m.personId] as const))
  const medicines = needs(next.medicines) ? next.medicines.map((m) => (m.personId ? m : { ...m, personId: active })) : next.medicines
  for (const m of medicines) medP.set(m.id, m.personId)
  const series = next.series.map((x) => (x.personId ? x : { ...x, personId: (x.medicineId && medP.get(x.medicineId)) || active }))
  const serP = new Map(series.map((x) => [x.id, x.personId] as const))
  const reminders = next.reminders.map((r) => (r.personId ? r : { ...r, personId: (r.seriesId && serP.get(r.seriesId)) || (r.medicineId && medP.get(r.medicineId)) || active }))
  const readings = needs(next.readings) ? next.readings.map((x) => (x.personId ? x : { ...x, personId: active })) : next.readings
  const appointments = needs(next.appointments) ? next.appointments.map((x) => (x.personId ? x : { ...x, personId: active })) : next.appointments
  return { ...next, medicines, series, reminders, readings, appointments }
}

/** Problems that would mean a record is attached to the wrong or a missing person. Used by tests and a startup self-check. */
export function integrityProblems(s: AppState): string[] {
  const out: string[] = []
  const ids = new Set(s.people.map((p) => p.id))
  const med = new Map(s.medicines.map((m) => [m.id, m] as const))
  const ser = new Map(s.series.map((x) => [x.id, x] as const))
  const chk = (kind: string, l: Array<Owned & { id: string }>) => l.forEach((x) => { if (!x.personId || !ids.has(x.personId)) out.push(`${kind} ${x.id} has no valid person`) })
  chk('medicine', s.medicines); chk('series', s.series); chk('reminder', s.reminders); chk('reading', s.readings); chk('appointment', s.appointments)
  for (const x of s.series) if (x.medicineId && med.get(x.medicineId) && med.get(x.medicineId)!.personId !== x.personId) out.push(`series ${x.id} differs from its medicine's person`)
  for (const r of s.reminders) {
    if (r.seriesId && ser.get(r.seriesId) && ser.get(r.seriesId)!.personId !== r.personId) out.push(`reminder ${r.id} differs from its series' person`)
    if (r.medicineId && med.get(r.medicineId) && med.get(r.medicineId)!.personId !== r.personId) out.push(`reminder ${r.id} differs from its medicine's person`)
  }
  if (new Set(s.people.filter((p) => p.relationship === 'self').map((p) => p.id)).size > 1) out.push('more than one self profile')
  return out
}

/**
 * Server TTS persona for this person. An explicit chip (mom/dad) wins; otherwise mother→mom and father→dad.
 * Never maps one parent onto the other parent's voice.
 */
export function assignedVoicePersona(p: Person | undefined): Person['sathiVoice'] {
  if (!p) return 'default'
  if (p.sathiVoice !== 'default') return p.sathiVoice
  if (p.relationship === 'mother') return 'mom'
  if (p.relationship === 'father') return 'dad'
  return 'default'
}

/** Which configured server voice Sathi uses for the ACTIVE person (stored on that person, never global). */
export const voicePersona = (s: Pick<AppState, 'people' | 'activePersonId'>): Person['sathiVoice'] => assignedVoicePersona(activePerson(s))

export const newPersonId = () => newId('per')
