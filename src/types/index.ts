export type ProfileId = 'self' | 'mother' | 'father';

export interface Profile {
  id: ProfileId;
  name: string;
  relation: string; // "Me", "Mummy", "Papa"
  initial: string;
  demo?: boolean;
}

export type FoodInstruction = 'Before food' | 'With food' | 'After food' | 'No instruction';
export type Frequency = 'Once daily' | 'Twice daily' | 'Three times daily' | 'Custom';
export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening' | 'Night';
export type MedicineStatus = 'ready' | 'needs_review' | 'paused' | 'unconfigured';

export interface Medicine {
  id: string;
  profileId: ProfileId;
  name: string; // "Metformin"
  strength: string; // "500mg"
  dose: string; // "1 tablet"
  frequency: Frequency;
  timeOfDay: TimeOfDay;
  times: string[]; // 24h "HH:MM"
  food: FoodInstruction;
  duration: 'Ongoing' | 'Fixed course';
  courseDays?: number;
  forCondition?: string;
  startedOn: string; // ISO date
  endedOn?: string;
  status: MedicineStatus;
  completed?: boolean;
  originalRx?: string; // original extracted text, preserved
  brandName?: string;
  genericName?: string;
  reviewFlags?: string[];
  prescriptionId?: string;
  gradient: [string, string];
  demo?: boolean;
}

export type EventStatus = 'upcoming' | 'taken' | 'missed' | 'skipped' | 'snoozed';

export interface ReminderEvent {
  id: string;
  profileId: ProfileId;
  medicineId: string;
  kind?: 'medicine' | 'custom' | 'appointment';
  title?: string;
  notes?: string;
  date: string; // ISO date
  time: string; // "HH:MM" scheduled
  recurrence?: 'none' | 'daily' | 'weekly';
  status: EventStatus;
  actedAt?: string; // ISO datetime
  snoozedUntil?: string; // ISO datetime
  selfReported?: boolean;
  demo?: boolean;
}

export type SugarContext = 'Fasting' | 'Before meal' | 'After meal' | 'Random';

export interface HealthReading {
  id: string;
  profileId: ProfileId;
  type: 'sugar' | 'bp';
  value?: number; // mg/dL
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  context?: SugarContext;
  contextLabel?: string; // e.g. "After breakfast"
  meal?: string; // meal description, saved with the reading
  at: string; // ISO datetime
  source: 'voice' | 'manual' | 'demo';
  demo?: boolean;
}

export interface Appointment {
  id: string;
  profileId: ProfileId;
  title: string;
  doctor?: string;
  clinic?: string;
  at: string; // ISO datetime
  note?: string;
  reminder?: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  demo?: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  role: 'Admin' | 'Read-only';
  status: 'Active' | 'Pending';
  demo?: boolean;
}

export type SyncState = 'Draft' | 'Awaiting confirmation' | 'Confirmed' | 'Sync pending' | 'Synced';

export interface ChangeRequest {
  id: string;
  profileId: ProfileId;
  kind: 'change' | 'new';
  medicineId?: string; // for change
  newName?: string; // for new
  newStrength?: string;
  newTimes?: string[];
  oldTimes?: string[];
  description: string;
  by: string;
  state: SyncState | 'Declined';
  demo?: boolean;
}

export interface VoiceEntry {
  id: string;
  profileId: ProfileId;
  at: string;
  kind: 'reminder-call' | 'health-entry';
  summary: string;
  demo?: boolean;
}

export interface Settings {
  language: 'हिन्दी' | 'English' | 'मराठी' | 'ಕನ್ನಡ';
  textSize: 'Standard' | 'Large' | 'Extra';
  speakingSpeed: 'Normal' | 'Slower';
  reminderTone: 'Gentle' | 'Standard';
  quietHours: boolean;
  notificationsAllowed: boolean;
  micAllowed: boolean;
  storeSummaries: boolean;
  storeVoice: boolean;
  voiceCloning: boolean;
  deviceOnline: boolean;
}

export interface Onboarding {
  done: boolean;
  name: string;
  phone: string;
  purpose: 'self' | 'parent';
}

export interface AppState {
  version: number;
  onboarding: Onboarding;
  activeProfileId: ProfileId;
  profiles: Profile[];
  medicines: Medicine[];
  events: ReminderEvent[];
  readings: HealthReading[];
  appointments: Appointment[];
  family: FamilyMember[];
  changeRequests: ChangeRequest[];
  voiceHistory: VoiceEntry[];
  settings: Settings;
  /** Prescription extraction (demo or live). Reminders are not active until the user confirms. */
  extraction: {
    items: Medicine[];
    reviewed: string[];
    live?: boolean;
    jobId?: string;
    prescriptionId?: string;
    previewUrl?: string;
    warnings?: string[];
    document?: { patientName: string; doctorName: string; prescriptionDate: string };
    error?: string;
  } | null;
}
