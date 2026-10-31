/** Pure mapping between the app's models (camelCase) and database rows (snake_case). Unit-tested. */
import type { Appointment, AppState, FamilyMember, Medicine, Person, Reading, Reminder, ReminderSeries } from '../domain/types'

const iso = (v: unknown) => (v == null ? undefined : new Date(v as string).toISOString())
const nn = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v)

export const medToRow = (m: Medicine, uid: string) => ({
  id: m.id, owner_id: uid, person_id: m.personId ?? null, name: m.name, strength: m.strength, dose: m.dose, frequency: m.frequency, times: m.times, time_zone: m.timeZone,
  food: m.food, duration: m.duration, course_days: m.courseDays ?? null, notes: m.notes, purpose: m.purpose ?? null, status: m.status,
  source: m.source, source_text: m.sourceText ?? null, flags: m.flags, extraction_provider: m.extractionProvider ?? null,
  extraction_batch: m.extractionBatch ?? null, color: m.color ?? null,
  stock_settings: m.stock ? { unit: m.stock.unit, perDose: m.stock.perDose, dosesPerDay: m.stock.dosesPerDay, lowDays: m.stock.lowDays ?? null, lowPct: m.stock.lowPct ?? null, leadDays: m.stock.leadDays ?? null } : null,
  start_date: m.startDate ?? null, end_date: m.endDate ?? null, prescriber: m.prescriber ?? null, prescription_ref: m.prescriptionRef ?? null, follow_up_date: m.followUpDate ?? null, started_on: m.startedOn ?? null, activated_at: m.activatedAt ?? null, created_at: m.createdAt,
})
export const medFromRow = (r: Record<string, any>): Medicine => ({
  id: r.id, personId: nn(r.person_id), name: r.name, strength: r.strength, dose: r.dose, frequency: r.frequency, timeOfDay: [], times: r.times ?? [], food: r.food ?? null,
  duration: r.duration, courseDays: nn(r.course_days), notes: r.notes ?? '', purpose: nn(r.purpose), status: r.status, source: r.source,
  sourceText: nn(r.source_text), flags: r.flags ?? [], timeZone: r.time_zone, createdAt: iso(r.created_at)!, activatedAt: iso(r.activated_at),
  startedOn: nn(r.started_on), startDate: nn(r.start_date), endDate: nn(r.end_date), prescriber: nn(r.prescriber), prescriptionRef: nn(r.prescription_ref), followUpDate: nn(r.follow_up_date),
  stock: r.stock_settings ? { unit: r.stock_settings.unit ?? 'tablet', perDose: Number(r.stock_settings.perDose ?? 0), dosesPerDay: Number(r.stock_settings.dosesPerDay ?? 0), lowDays: r.stock_settings.lowDays ?? undefined, lowPct: r.stock_settings.lowPct ?? undefined, leadDays: r.stock_settings.leadDays ?? undefined, ledger: [] } : undefined,
  extractionProvider: nn(r.extraction_provider), extractionBatch: nn(r.extraction_batch), color: nn(r.color),
})

export const seriesToRow = (s: ReminderSeries) => ({
  id: s.id, owner_id: s.ownerId, person_id: s.personId ?? null, kind: s.kind, title: s.title, notes: s.notes ?? null, medication_id: s.medicineId ?? null, local_time: s.localTime,
  time_zone: s.timeZone, active: s.active, start_at: s.startAt, ends_on: s.endsOn ?? null,
})
export const seriesFromRow = (r: Record<string, any>): ReminderSeries => ({
  id: r.id, personId: nn(r.person_id), ownerId: r.owner_id, kind: r.kind, title: r.title, notes: nn(r.notes), medicineId: nn(r.medication_id), localTime: r.local_time,
  timeZone: r.time_zone, active: r.active, startAt: iso(r.start_at)!, endsOn: nn(r.ends_on),
})

export const reminderToRow = (r: Reminder, uid: string) => ({
  id: r.id, owner_id: uid, person_id: r.personId ?? null, kind: r.kind, title: r.title, notes: r.notes ?? null, medication_id: r.medicineId ?? null, appointment_id: r.appointmentId ?? null,
  series_id: r.seriesId ?? null, scheduled_for: r.scheduledFor, original_scheduled_for: r.originalScheduledFor, time_zone: r.timeZone, recurrence: r.recurrence,
  status: r.status, snooze_history: r.snoozeHistory, reschedule_history: r.rescheduleHistory, completed_at: r.completedAt ?? null, cancelled_at: r.cancelledAt ?? null, skipped_at: r.skippedAt ?? null,
  completion: r.completion ?? null, idempotency_key: r.idempotencyKey,
})
export const reminderFromRow = (r: Record<string, any>, attempts: Reminder['deliveryAttempts'] = []): Reminder => ({
  id: r.id, personId: nn(r.person_id), ownerId: r.owner_id, kind: r.kind, title: r.title, notes: nn(r.notes), medicineId: nn(r.medication_id), appointmentId: nn(r.appointment_id),
  seriesId: nn(r.series_id), scheduledFor: iso(r.scheduled_for)!, originalScheduledFor: iso(r.original_scheduled_for)!, timeZone: r.time_zone,
  recurrence: r.recurrence ?? null, status: r.status, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!, completedAt: iso(r.completed_at),
  cancelledAt: iso(r.cancelled_at), skippedAt: iso(r.skipped_at), completion: nn(r.completion), snoozeHistory: r.snooze_history ?? [], rescheduleHistory: r.reschedule_history ?? [],
  deliveryAttempts: attempts, idempotencyKey: r.idempotency_key,
})

export const readingToRow = (r: Reading, uid: string) => ({
  id: r.id, owner_id: uid, person_id: r.personId ?? null, type: r.type, at: r.at, value: r.value ?? null, unit: r.unit ?? null, context: r.context ?? null, systolic: r.systolic ?? null,
  diastolic: r.diastolic ?? null, pulse: r.pulse ?? null, note: r.note ?? null, source: r.source,
})
export const readingFromRow = (r: Record<string, any>): Reading => ({
  id: r.id, personId: nn(r.person_id), type: r.type, at: iso(r.at)!, value: r.value == null ? undefined : Number(r.value), unit: nn(r.unit), context: nn(r.context), systolic: nn(r.systolic),
  diastolic: nn(r.diastolic), pulse: nn(r.pulse), note: nn(r.note), source: r.source, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
})

export const apptToRow = (a: Appointment, uid: string) => ({
  id: a.id, owner_id: uid, person_id: a.personId ?? null, title: a.title, doctor: a.doctor ?? null, at: a.at, time_zone: a.timeZone, notes: a.notes ?? null, reminder: a.reminder,
  reminder_id: a.reminderId ?? null, status: a.status,
})
export const apptFromRow = (r: Record<string, any>): Appointment => ({
  id: r.id, personId: nn(r.person_id), title: r.title, doctor: nn(r.doctor), at: iso(r.at)!, timeZone: r.time_zone, notes: nn(r.notes), reminder: r.reminder, reminderId: nn(r.reminder_id),
  status: r.status, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
})

export const profileToRow = (s: AppState, uid: string) => ({
  id: uid, full_name: s.profile.name, call_name: s.profile.callName, phone: s.profile.phone ? `+91${s.profile.phone.replace(/\D/g, '')}` : null,
  language: s.profile.language, time_zone: s.profile.timeZone, role: s.profile.role, text_size: s.profile.textSize, speaking_speed: s.profile.speakingSpeed,
  reminder_tone: s.profile.reminderTone, quiet_hours: s.prefs.quietHours, voice_recordings: s.prefs.voiceRecordings,
  conversation_summaries: s.prefs.conversationSummaries, voice_cloning_consent: s.prefs.voiceCloningConsent,
  voice_cloning_consent_at: s.prefs.voiceCloningConsent ? new Date().toISOString() : null,
  onboarding_mode: s.profile.role, active_person_id: s.activePersonId || null,
})
export function profileFromRow(r: Record<string, any>): Pick<AppState, 'profile' | 'prefs'> extends infer T ? { profile: Partial<AppState['profile']>; prefs: Partial<AppState['prefs']>; activePersonId?: string } : never {
  return {
    profile: { name: r.full_name, callName: r.call_name, phone: (r.phone ?? '').replace(/^\+91/, ''), language: r.language, timeZone: r.time_zone, role: r.role,
      textSize: r.text_size, speakingSpeed: r.speaking_speed, reminderTone: r.reminder_tone },
    activePersonId: r.active_person_id ?? undefined,
    prefs: { quietHours: r.quiet_hours, voiceRecordings: r.voice_recordings, conversationSummaries: r.conversation_summaries, voiceCloningConsent: r.voice_cloning_consent },
  }
}

export const personToRow = (p: Person, uid: string) => ({
  id: p.id, owner_id: uid, relationship: p.relationship, relationship_label: p.relationshipLabel, display_name: p.displayName, greeting_name: p.greetingName,
  language: p.language, time_zone: p.timeZone, speaking_speed: p.speakingSpeed, reminder_tone: p.reminderTone, sathi_voice: p.sathiVoice,
  notifications_enabled: p.notificationsEnabled, phone: p.phone ?? null, email: p.email ?? null, active: !p.archived,
})
export const personFromRow = (r: Record<string, any>): Person => ({
  id: r.id, relationship: r.relationship, relationshipLabel: r.relationship_label ?? '', displayName: r.display_name ?? '', greetingName: r.greeting_name ?? '',
  language: r.language, timeZone: r.time_zone, speakingSpeed: r.speaking_speed, reminderTone: r.reminder_tone, sathiVoice: r.sathi_voice,
  notificationsEnabled: r.notifications_enabled, phone: nn(r.phone), email: nn(r.email), archived: r.active === false, createdAt: iso(r.created_at) ?? new Date().toISOString(),
})

export const stockToRows = (m: Medicine, uid: string) => (m.stock?.ledger ?? []).map((t) => ({
  id: t.id, owner_id: uid, person_id: m.personId ?? null, medication_id: m.id, type: t.type, qty: t.qty, source: t.source, note: t.note ?? null, at: t.at, created_by: uid,
}))
export const stockFromRow = (r: Record<string, any>) => ({ id: r.id, at: iso(r.at)!, type: r.type, qty: Number(r.qty), source: r.source, note: nn(r.note) })

export const memberFromRow = (r: { id: string; relation: string; role: 'admin' | 'read-only' | 'helper'; status: string; invited_email: string | null; person_scope: string[] | null; perm_help_setup: boolean; perm_view_schedule: boolean; perm_view_readings: boolean; expires_at: string }): FamilyMember => ({
  id: r.id, name: r.invited_email ?? (r.status === 'pending' ? 'Invited family member' : r.relation), relation: r.relation, role: r.role, status: r.status === 'active' ? 'active' : 'pending',
  permissions: { helpSetup: r.perm_help_setup, viewSchedule: r.perm_view_schedule, viewReadings: r.perm_view_readings }, simulated: false, server: true, email: r.invited_email ?? undefined, expiresAt: r.expires_at, scope: r.person_scope,
})
