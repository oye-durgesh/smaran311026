export type Lang = 'hi' | 'en' | 'mr' | 'kn'
export type TextSize = 'standard' | 'large' | 'extra'

export interface Profile {
  name: string
  callName: string
  email: string // the sign-in email of the account holder (administrator)
  phone: string // OPTIONAL contact number; never a login credential
  language: Lang
  timeZone: string
  role: 'self' | 'parent'
  textSize: TextSize
  speakingSpeed: 'normal' | 'slower'
  reminderTone: 'gentle' | 'standard'
  onboarded: boolean
  signedIn: boolean
}

/** A person whose health is managed in this account: the account holder ("self") and any parents. The id is stable and
 *  independent of every name; greetingName only says how Sathi addresses them. */
export type Relationship = 'self' | 'mother' | 'father' | 'other'
export interface Person {
  id: string
  relationship: Relationship
  relationshipLabel: string // custom relationship text for 'other' (e.g. "Dadi"); '' otherwise
  displayName: string
  greetingName: string
  language: Lang
  timeZone: string
  speakingSpeed: 'normal' | 'slower'
  reminderTone: 'gentle' | 'standard'
  sathiVoice: 'default' | 'mom' | 'dad'
  notificationsEnabled: boolean
  phone?: string
  email?: string
  archived: boolean
  createdAt: string
}

export type Frequency = 'once' | 'twice' | 'thrice' | 'custom'
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'
export type Food = 'before' | 'with' | 'after' | 'none'
export type MedStatus = 'draft' | 'confirmed' | 'active' | 'paused' | 'completed' | 'removed'
export type MedFlag = 'timing_unclear' | 'exact_time_needed' | 'food_missing' | 'strength_missing' | 'dose_missing' | 'frequency_unclear' | 'duration_unclear' | 'as_needed' | 'low_confidence'

export interface StockTxn {
  id: string
  at: string
  type: 'opening' | 'refill' | 'adjustment' | 'consumed'   // 'consumed' is for manual corrections; confirmed doses are derived from reminders
  qty: number                                               // always positive; the type gives the direction (an adjustment may carry a negative note)
  source: 'user' | 'count' | 'prescription'
  note?: string
}
export interface StockInfo {
  unit: string            // "tablet", "capsule", "ml"…
  perDose: number         // units taken each time, as CONFIRMED by the user (never inferred from free text)
  dosesPerDay: number     // 0 = use the number of reminder times
  lowDays?: number        // warn when this many days of supply remain (default 7)
  lowPct?: number         // optionally also warn at this % of the last supply
  leadDays?: number       // how many days before running out to reorder (default 3)
  ledger: StockTxn[]
}

export interface Medicine {
  id: string
  personId?: string // whose medicine this is (stamped by the store; never changes)
  stock?: StockInfo
  startDate?: string // yyyy-mm-dd, as written on the prescription (not the activation date)
  endDate?: string
  prescriber?: string
  prescriptionRef?: string
  followUpDate?: string
  name: string
  strength: string
  dose: string
  frequency: Frequency
  timeOfDay: TimeOfDay[]
  times: string[] // "HH:mm" in the owner's time zone
  food: Food | null // null = not specified in source, needs review
  duration: 'ongoing' | 'course'
  courseDays?: number
  notes: string
  purpose?: string
  status: MedStatus
  source: 'manual' | 'prescription' | 'voice' | 'family'
  sourceText?: string
  flags: MedFlag[]
  timeZone: string
  createdAt: string
  activatedAt?: string
  startedOn?: string
  extractionProvider?: string
  extractionBatch?: string
  color?: number
}

export type ReminderStatus = 'scheduled' | 'ringing' | 'snoozed' | 'completed' | 'missed' | 'cancelled' | 'declined' | 'skipped'
export type ReminderKind = 'medicine' | 'custom' | 'appointment'

export interface SnoozeEntry { at: string; from: string; to: string; minutes: number }
export interface RescheduleEntry { at: string; from: string; to: string; reason: string }
export interface DeliveryAttempt {
  at: string
  channel: 'local' | 'notification' | 'incall-ui' | 'server-push'
  outcome: 'delivered' | 'failed' | 'answered' | 'declined' | 'expired' | 'unsupported'
  note?: string
}

export interface Reminder {
  id: string
  personId?: string
  ownerId: string
  kind: ReminderKind
  title: string
  notes?: string
  medicineId?: string
  appointmentId?: string
  seriesId?: string
  scheduledFor: string // ISO UTC, current effective due time
  originalScheduledFor: string
  timeZone: string
  recurrence: null | { freq: 'daily'; localTime: string }
  status: ReminderStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  cancelledAt?: string
  completion?: { via: 'voice' | 'tap' | 'manual'; basis: 'user-reported' }
  skippedAt?: string // the person chose to skip this dose (recorded; it does not consume stock and is never made up by taking extra)
  snoozeHistory: SnoozeEntry[]
  rescheduleHistory: RescheduleEntry[]
  deliveryAttempts: DeliveryAttempt[]
  idempotencyKey: string
}

export interface ReminderSeries {
  id: string
  personId?: string
  ownerId: string
  kind: ReminderKind
  title: string
  notes?: string
  medicineId?: string
  localTime: string // HH:mm
  timeZone: string
  active: boolean
  startAt: string
  endsOn?: string // local date yyyy-mm-dd, inclusive
}

export type ReadingType = 'sugar' | 'bp'
export type SugarContext = 'fasting' | 'before_meal' | 'after_meal' | 'random' | 'unspecified'
export interface Reading {
  id: string
  personId?: string
  type: ReadingType
  at: string // ISO UTC of measurement
  value?: number // sugar value in `unit`
  unit?: 'mg/dL' | 'mmol/L'
  context?: SugarContext
  systolic?: number
  diastolic?: number
  pulse?: number
  note?: string
  source: 'manual' | 'voice' | 'sample'
  createdAt: string
  updatedAt: string
}

export interface Appointment {
  id: string
  personId?: string
  title: string
  doctor?: string
  at: string
  timeZone: string
  notes?: string
  reminder: 'none' | '1h' | '1d' | 'evening_before'
  reminderId?: string
  status: 'upcoming' | 'cancelled' | 'completed'
  createdAt: string
  updatedAt: string
}

export interface Permissions {
  helpSetup: boolean
  viewSchedule: boolean
  viewReadings: boolean
}

export interface FamilyInvite {
  id: string
  code: string
  url: string
  createdAt: string
  status: 'pending' | 'accepted' | 'revoked'
  relation: string
  permissions: Permissions
}

export interface FamilyMember {
  id: string
  name: string
  relation: string
  role: 'admin' | 'read-only' | 'helper'
  status: 'active' | 'pending'
  permissions: Permissions
  inviteId?: string
  simulated: boolean
  server?: boolean // a real membership row on the server
  email?: string
  expiresAt?: string
  scope?: string[] | null
}

export type ProposalState = 'draft' | 'awaiting' | 'approved' | 'declined'
export interface Proposal {
  id: string
  kind: 'change' | 'new'
  medicineId?: string
  title: string
  summary: string
  patch?: Partial<Medicine>
  newMedicine?: Medicine
  state: ProposalState
  by: string
  createdAt: string
  updatedAt: string
}

export interface AuditEntry { id: string; at: string; actor: string; action: string; detail: string }

export interface Prescription {
  fileName: string
  mime: string
  size: number
  fileKey: string // IndexedDB key for the original file
  language?: string // document language sent to the reader (BCP-47, e.g. hi-IN)
  addedAt: string
  /** Explicit sample prescription. Only this flag uses labelled demo medicines — a real upload never does. */
  demoSample?: boolean
}

export interface ExtractionRecord {
  batchId: string
  provider: 'mock' | 'sarvam'
  at: string
  isMock: boolean
  rawText: string
  outcome: 'success' | 'partial' | 'error'
  error?: string
  errorCode?: string
  jobId?: string
  language?: string
  rawFormat?: 'md' | 'html' | 'json'
  otherInstructions?: string[]
  warnings?: string[]
  document?: { patientName: string; doctorName: string; prescriptionDate: string }
}

export interface Preferences {
  quietHours: { enabled: boolean; from: string; to: string }
  voiceRecordings: boolean
  conversationSummaries: boolean
  voiceCloningConsent: boolean
  serverVoice: boolean // speak Sathi's replies with the server (ElevenLabs) voice when a backend is connected
  serverAgent: boolean // beta: live ElevenLabs agent conversation instead of the local command parser
  permissionAsked: { notifications: boolean; microphone: boolean }
}

export interface DemoSettings {
  clockOffsetMs: number // deterministic test mode: shifts "now"
  extractionOutcome: 'success' | 'partial' | 'error'
  sampleData: boolean
  demoFamily?: boolean // the synthetic demo family (Mummy/Papa) is loaded; nothing in it is real and it is never uploaded
}

export interface AppState {
  version: 1
  profile: Profile
  prefs: Preferences
  people: Person[]
  activePersonId: string
  medicines: Medicine[]
  series: ReminderSeries[]
  reminders: Reminder[]
  readings: Reading[]
  appointments: Appointment[]
  family: { invites: FamilyInvite[]; members: FamilyMember[]; proposals: Proposal[]; defaultPermissions: Permissions; audit: AuditEntry[] }
  setup: { prescription: Prescription | null; extraction: ExtractionRecord | null; returnTo: string | null }
  drafts: Record<string, unknown>
  conversation: ConversationLog[]
  demo: DemoSettings
}

export interface ConversationLog {
  id: string
  at: string
  reminderId?: string
  outcome: string
  summary: string
}
