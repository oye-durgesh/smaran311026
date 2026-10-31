/** Map Claude frontend models onto the seven Supabase tables. Screens never import this file. */
import type { Appointment, AppState, HealthReading, Medicine, ProfileId, ReminderEvent, Settings } from '../types'

export const memberId = (uid: string, profileId: ProfileId) => `${profileId}_${uid}`

const FOOD: Record<Medicine['food'], 'before' | 'with' | 'after' | 'none'> = {
  'Before food': 'before', 'With food': 'with', 'After food': 'after', 'No instruction': 'none',
}
const FOOD_BACK: Record<string, Medicine['food']> = { before: 'Before food', with: 'With food', after: 'After food', none: 'No instruction' }

const FREQ: Record<Medicine['frequency'], 'once' | 'twice' | 'thrice' | 'custom'> = {
  'Once daily': 'once', 'Twice daily': 'twice', Thrice: 'thrice', Custom: 'custom',
}
const FREQ_BACK: Record<string, Medicine['frequency']> = { once: 'Once daily', twice: 'Twice daily', thrice: 'Thrice', custom: 'Custom' }

const MED_STATUS: Record<Medicine['status'], string> = { ready: 'active', needs_review: 'draft', paused: 'paused', unconfigured: 'draft' }
const MED_STATUS_BACK = (s: string): Medicine['status'] => (s === 'active' || s === 'confirmed' ? 'ready' : s === 'paused' ? 'paused' : 'needs_review')

const EVT: Record<ReminderEvent['status'], string> = { upcoming: 'scheduled', taken: 'completed', missed: 'missed', skipped: 'skipped', snoozed: 'snoozed' }
const EVT_BACK = (s: string): ReminderEvent['status'] => (
  s === 'completed' ? 'taken' : s === 'snoozed' ? 'snoozed' : s === 'missed' ? 'missed' : s === 'skipped' ? 'skipped' : 'upcoming'
)

const CTX: Record<NonNullable<HealthReading['context']>, string> = {
  Fasting: 'fasting', 'Before meal': 'before_meal', 'After meal': 'after_meal', Random: 'random',
}
const CTX_BACK: Record<string, HealthReading['context']> = {
  fasting: 'Fasting', before_meal: 'Before meal', after_meal: 'After meal', random: 'Random', unspecified: 'Random',
}

const LANG: Record<Settings['language'], string> = { हिन्दी: 'hi', English: 'en', मराठी: 'mr', ಕನ್ನಡ: 'kn' }
const LANG_BACK: Record<string, Settings['language']> = { hi: 'हिन्दी', en: 'English', mr: 'मराठी', kn: 'ಕನ್ನಡ' }

const SIZE: Record<Settings['textSize'], string> = { Standard: 'standard', Large: 'large', Extra: 'extra' }
const SIZE_BACK: Record<string, Settings['textSize']> = { standard: 'Standard', large: 'Large', extra: 'Extra' }

export function isDemoRecord(v: { demo?: boolean; source?: string } | null | undefined): boolean {
  if (!v) return false
  return v.demo === true || v.source === 'demo'
}

export const profileRow = (s: AppState, uid: string) => ({
  id: uid,
  display_name: s.onboarding.name || s.profiles.find((p) => p.id === 'self')?.name || '',
  full_name: s.onboarding.name || '',
  call_name: s.profiles.find((p) => p.id === 'self')?.name || s.onboarding.name || '',
  phone: s.onboarding.phone ? `+91${s.onboarding.phone.replace(/\D/g, '')}` : null,
  language: LANG[s.settings.language] ?? 'hi',
  time_zone: 'Asia/Kolkata',
  role: s.onboarding.purpose === 'parent' ? 'parent' : 'self',
  text_size: SIZE[s.settings.textSize] ?? 'large',
  speaking_speed: s.settings.speakingSpeed === 'Slower' ? 'slower' : 'normal',
  reminder_tone: s.settings.reminderTone === 'Standard' ? 'standard' : 'gentle',
  quiet_hours: { enabled: s.settings.quietHours, from: '22:00', to: '07:00' },
  voice_recordings: s.settings.storeVoice,
  conversation_summaries: s.settings.storeSummaries,
  voice_cloning_consent: s.settings.voiceCloning,
  active_person_id: memberId(uid, s.activeProfileId),
})

export const familyMemberRow = (s: AppState, uid: string, profileId: ProfileId) => {
  const p = s.profiles.find((x) => x.id === profileId)
  if (!p) return null
  return {
    id: memberId(uid, profileId),
    owner_id: uid,
    relationship: profileId,
    relationship_label: p.relation,
    display_name: p.name,
    greeting_name: p.name,
    language: LANG[s.settings.language] ?? 'hi',
    time_zone: 'Asia/Kolkata',
    speaking_speed: s.settings.speakingSpeed === 'Slower' ? 'slower' : 'normal',
    reminder_tone: s.settings.reminderTone === 'Standard' ? 'standard' : 'gentle',
    sathi_voice: profileId === 'mother' ? 'mom' : profileId === 'father' ? 'dad' : 'default',
    notifications_enabled: s.settings.notificationsAllowed,
    active: true,
  }
}

export const medicineRow = (m: Medicine, uid: string) => ({
  id: m.id,
  owner_id: uid,
  family_member_id: memberId(uid, m.profileId),
  name: m.name,
  dosage: `${m.strength} ${m.dose}`.trim(),
  strength: m.strength,
  dose: m.dose,
  instructions: m.originalRx ?? '',
  notes: m.forCondition ?? '',
  purpose: m.forCondition ?? null,
  frequency: FREQ[m.frequency],
  times: m.times,
  time_zone: 'Asia/Kolkata',
  food: FOOD[m.food],
  duration: m.duration === 'Fixed course' ? 'course' : 'ongoing',
  course_days: m.courseDays ?? null,
  status: MED_STATUS[m.status],
  source: 'manual',
  source_text: m.originalRx ?? null,
  start_date: m.startedOn || null,
  end_date: m.endedOn || null,
  stock_settings: { gradient: m.gradient, timeOfDay: m.timeOfDay },
})

export const medicineFromRow = (r: Record<string, unknown>, fallback: ProfileId): Medicine => {
  const extra = (r.stock_settings ?? {}) as { gradient?: [string, string]; timeOfDay?: Medicine['timeOfDay'] }
  const rel = String(r.family_member_id ?? '').split('_')[0] as ProfileId
  const profileId: ProfileId = rel === 'mother' || rel === 'father' || rel === 'self' ? rel : fallback
  return {
    id: String(r.id),
    profileId,
    name: String(r.name ?? ''),
    strength: String(r.strength ?? ''),
    dose: String(r.dose ?? '1 tablet'),
    frequency: FREQ_BACK[String(r.frequency)] ?? 'Once daily',
    timeOfDay: extra.timeOfDay ?? 'Morning',
    times: (r.times as string[]) ?? ['08:00'],
    food: FOOD_BACK[String(r.food)] ?? 'No instruction',
    duration: r.duration === 'course' ? 'Fixed course' : 'Ongoing',
    courseDays: r.course_days == null ? undefined : Number(r.course_days),
    forCondition: (r.purpose as string) || undefined,
    startedOn: r.start_date ? String(r.start_date).slice(0, 10) : '',
    endedOn: r.end_date ? String(r.end_date).slice(0, 10) : undefined,
    status: MED_STATUS_BACK(String(r.status)),
    completed: String(r.status) === 'completed' || String(r.status) === 'removed',
    originalRx: (r.source_text as string) || undefined,
    gradient: extra.gradient ?? ['#D4A57C', '#B87D5A'],
  }
}

export const scheduleRow = (m: Medicine, uid: string) => ({
  id: `sch_${m.id}`,
  owner_id: uid,
  family_member_id: memberId(uid, m.profileId),
  medicine_id: m.id,
  kind: 'medicine',
  title: m.name,
  local_time: m.times[0] ?? '08:00',
  frequency: FREQ[m.frequency],
  time_zone: 'Asia/Kolkata',
  active: m.status === 'ready',
  start_at: new Date().toISOString(),
})

export const reminderRow = (e: ReminderEvent, uid: string) => {
  const at = `${e.date}T${e.time}:00+05:30`
  const kind = e.kind === 'custom' || e.kind === 'appointment' ? e.kind : 'medicine'
  return {
    id: e.id,
    owner_id: uid,
    family_member_id: memberId(uid, e.profileId),
    kind,
    title: e.title || (kind === 'medicine' ? 'Medicine reminder' : 'Reminder'),
    notes: e.notes ?? null,
    medicine_id: kind === 'medicine' && e.medicineId ? e.medicineId : null,
    schedule_id: kind === 'medicine' && e.medicineId ? `sch_${e.medicineId}` : null,
    scheduled_for: at,
    original_scheduled_for: at,
    time_zone: 'Asia/Kolkata',
    recurrence: e.recurrence && e.recurrence !== 'none' ? { every: e.recurrence } : null,
    status: EVT[e.status],
    completed_at: e.status === 'taken' ? e.actedAt ?? null : null,
    completion: e.selfReported ? { via: 'self-reported', basis: 'user-reported' } : null,
    idempotency_key: e.id,
  }
}

export const reminderFromRow = (r: Record<string, unknown>, fallback: ProfileId): ReminderEvent => {
  const when = new Date(String(r.scheduled_for))
  const rel = String(r.family_member_id ?? '').split('_')[0] as ProfileId
  return {
    id: String(r.id),
    profileId: rel === 'mother' || rel === 'father' || rel === 'self' ? rel : fallback,
    medicineId: String(r.medicine_id ?? ''),
    kind: r.kind === 'custom' || r.kind === 'appointment' ? r.kind : 'medicine',
    title: String(r.title ?? ''),
    notes: (r.notes as string) || undefined,
    recurrence: (r.recurrence as { every?: 'daily' | 'weekly' } | null)?.every ?? 'none',
    date: when.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    time: when.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Kolkata' }).slice(0, 5),
    status: EVT_BACK(String(r.status)),
    actedAt: r.completed_at ? String(r.completed_at) : undefined,
    selfReported: !!(r.completion as { via?: string } | null)?.via,
  }
}

export const readingRow = (r: HealthReading, uid: string) => ({
  id: r.id,
  owner_id: uid,
  family_member_id: memberId(uid, r.profileId),
  type: r.type,
  at: r.at,
  value: r.value ?? null,
  unit: r.type === 'sugar' ? 'mg/dL' : null,
  context: r.context ? CTX[r.context] : null,
  systolic: r.systolic ?? null,
  diastolic: r.diastolic ?? null,
  pulse: r.pulse ?? null,
  note: [r.contextLabel, r.meal].filter(Boolean).join(' · ') || null,
  source: r.source === 'voice' ? 'voice' : 'manual',
})

export const readingFromRow = (r: Record<string, unknown>, fallback: ProfileId): HealthReading => {
  const rel = String(r.family_member_id ?? '').split('_')[0] as ProfileId
  const note = String(r.note ?? '')
  const [contextLabel, meal] = note.includes(' · ') ? note.split(' · ') : [note || undefined, undefined]
  return {
    id: String(r.id),
    profileId: rel === 'mother' || rel === 'father' || rel === 'self' ? rel : fallback,
    type: r.type === 'bp' ? 'bp' : 'sugar',
    value: r.value == null ? undefined : Number(r.value),
    systolic: r.systolic == null ? undefined : Number(r.systolic),
    diastolic: r.diastolic == null ? undefined : Number(r.diastolic),
    pulse: r.pulse == null ? undefined : Number(r.pulse),
    context: CTX_BACK[String(r.context)] ,
    contextLabel,
    meal,
    at: String(r.at),
    source: r.source === 'voice' ? 'voice' : 'manual',
  }
}

const apptReminder = (a: Appointment): 'none' | '1h' | '1d' | 'evening_before' => {
  const t = (a.reminder ?? '').toLowerCase()
  if (!t) return 'none'
  if (t.includes('evening')) return 'evening_before'
  return '1d'
}

export const appointmentRow = (a: Appointment, uid: string) => ({
  id: a.id,
  owner_id: uid,
  family_member_id: memberId(uid, a.profileId),
  title: a.title,
  doctor: a.doctor ?? null,
  clinic: a.clinic ?? null,
  at: a.at,
  time_zone: 'Asia/Kolkata',
  notes: a.note ?? null,
  reminder: apptReminder(a),
  status: a.status === 'completed' ? 'completed' : a.status === 'cancelled' ? 'cancelled' : 'upcoming',
})

export const appointmentFromRow = (r: Record<string, unknown>, fallback: ProfileId): Appointment => {
  const rel = String(r.family_member_id ?? '').split('_')[0] as ProfileId
  return {
    id: String(r.id),
    profileId: rel === 'mother' || rel === 'father' || rel === 'self' ? rel : fallback,
    title: String(r.title ?? ''),
    doctor: (r.doctor as string) || undefined,
    clinic: (r.clinic as string) || undefined,
    at: String(r.at),
    note: (r.notes as string) || undefined,
    reminder: r.reminder && r.reminder !== 'none' ? String(r.reminder) : undefined,
    status: r.status === 'completed' ? 'completed' : r.status === 'cancelled' ? 'cancelled' : 'upcoming',
  }
}

export function applyProfileRow(s: AppState, r: Record<string, unknown>): AppState {
  const phone = String(r.phone ?? '').replace(/^\+91/, '')
  return {
    ...s,
    onboarding: { ...s.onboarding, name: String(r.full_name ?? s.onboarding.name), phone: phone || s.onboarding.phone, purpose: r.role === 'parent' ? 'parent' : 'self', done: true },
    settings: {
      ...s.settings,
      language: LANG_BACK[String(r.language)] ?? s.settings.language,
      textSize: SIZE_BACK[String(r.text_size)] ?? s.settings.textSize,
      speakingSpeed: r.speaking_speed === 'slower' ? 'Slower' : 'Normal',
      reminderTone: r.reminder_tone === 'standard' ? 'Standard' : 'Gentle',
      quietHours: typeof r.quiet_hours === 'object' && r.quiet_hours ? !!(r.quiet_hours as { enabled?: boolean }).enabled : s.settings.quietHours,
      storeVoice: !!r.voice_recordings,
      storeSummaries: r.conversation_summaries !== false,
      voiceCloning: !!r.voice_cloning_consent,
    },
  }
}
