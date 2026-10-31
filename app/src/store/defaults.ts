import type { AppState, Permissions } from '../domain/types'

export const STORAGE_KEY = 'smaran:v1'
export const DEFAULT_TZ = 'Asia/Kolkata'

export const DEFAULT_PERMISSIONS: Permissions = { helpSetup: true, viewSchedule: true, viewReadings: false }

export function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ } catch { return DEFAULT_TZ }
}

export function initialState(): AppState {
  return {
    version: 1,
    profile: {
      name: '', callName: 'Mummy', email: '', phone: '', language: 'hi', timeZone: DEFAULT_TZ, role: 'self',
      textSize: 'large', speakingSpeed: 'normal', reminderTone: 'gentle', onboarded: false, signedIn: false,
    },
    prefs: {
      quietHours: { enabled: true, from: '22:00', to: '07:00' },
      voiceRecordings: false, conversationSummaries: true, voiceCloningConsent: false, serverVoice: true, serverAgent: false,
      permissionAsked: { notifications: false, microphone: false },
    },
    people: [], activePersonId: '',
    medicines: [], series: [], reminders: [], readings: [], appointments: [],
    family: { invites: [], members: [], proposals: [], defaultPermissions: { ...DEFAULT_PERMISSIONS }, audit: [] },
    setup: { prescription: null, extraction: null, returnTo: null },
    drafts: {}, conversation: [],
    demo: { clockOffsetMs: 0, extractionOutcome: 'success', sampleData: false },
  }
}
