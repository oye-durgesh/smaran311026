import type { AppState, Appointment, HealthReading, Medicine, ReminderEvent } from '../types';

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const daysAgo = (n: number, hh = 8, mm = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
export const daysAhead = (n: number, hh = 10, mm = 0) => daysAgo(-n, hh, mm);

const G = {
  brown: ['#D4A57C', '#B87D5A'] as [string, string],
  blue: ['#D4DEE6', '#A8BCC8'] as [string, string],
  peach: ['#F3D6C6', '#D98255'] as [string, string],
  plum: ['#ECE4EE', '#C4B0C2'] as [string, string],
  sage: ['#E7EDE2', '#B5C4A0'] as [string, string],
};

const med = (m: Partial<Medicine> & Pick<Medicine, 'id' | 'profileId' | 'name' | 'strength'>): Medicine => ({
  dose: '1 tablet',
  frequency: 'Once daily',
  timeOfDay: 'Morning',
  times: ['08:00'],
  food: 'No instruction',
  duration: 'Ongoing',
  startedOn: '2026-08-12',
  status: 'ready',
  gradient: G.brown,
  demo: true,
  ...m,
});

export const demoMedicines = (): Medicine[] => [
  // Ramesh (self) – matches the Home / Medicines designs
  med({ id: 'r-metformin', profileId: 'self', name: 'Metformin', strength: '500mg', frequency: 'Twice daily', times: ['08:00', '20:00'], food: 'After food', forCondition: 'Diabetes', originalRx: 'Tab Metformin 500mg 1-0-1 after food', gradient: G.brown }),
  med({ id: 'r-amlodipine', profileId: 'self', name: 'Amlodipine', strength: '5mg', timeOfDay: 'Morning', times: ['08:00'], food: 'No instruction', forCondition: 'Blood pressure', gradient: G.blue }),
  med({ id: 'r-ecosprin', profileId: 'self', name: 'Ecosprin', strength: '75mg', times: ['08:00'], food: 'No instruction', status: 'needs_review', originalRx: 'Ecosprin 75 OD', forCondition: 'Heart', gradient: G.peach }),
  med({ id: 'r-atorvastatin', profileId: 'self', name: 'Atorvastatin', strength: '10mg', timeOfDay: 'Night', times: ['22:00'], food: 'No instruction', forCondition: 'Cholesterol', gradient: G.plum }),
  // Mother (Mummy)
  med({ id: 'm-metformin', profileId: 'mother', name: 'Metformin', strength: '500mg', frequency: 'Twice daily', times: ['08:00', '20:00'], food: 'After food', forCondition: 'Diabetes', gradient: G.brown }),
  med({ id: 'm-amlodipine', profileId: 'mother', name: 'Amlodipine', strength: '5mg', times: ['08:00'], forCondition: 'Blood pressure', gradient: G.blue }),
  med({ id: 'm-atorvastatin', profileId: 'mother', name: 'Atorvastatin', strength: '10mg', timeOfDay: 'Night', times: ['22:00'], gradient: G.plum }),
  // Father (Papa)
  med({ id: 'f-ecosprin', profileId: 'father', name: 'Ecosprin', strength: '75mg', times: ['08:00'], food: 'After food', forCondition: 'Heart', gradient: G.peach }),
  med({ id: 'f-amlodipine', profileId: 'father', name: 'Amlodipine', strength: '5mg', times: ['08:00'], forCondition: 'Blood pressure', gradient: G.blue }),
];

/** Medicines the demo prescription scan "finds" (preserves original text, needs per-medicine review). */
export const demoExtraction = (profileId: Medicine['profileId']): Medicine[] => [
  med({ id: 'x-metformin', profileId, name: 'Metformin', strength: '500mg', frequency: 'Twice daily', times: ['08:00', '20:00'], food: 'After food', status: 'ready', originalRx: 'Tab Metformin 500mg 1-0-1 after food', gradient: G.brown }),
  med({ id: 'x-amlodipine', profileId, name: 'Amlodipine', strength: '5mg', times: ['08:00'], food: 'No instruction', status: 'ready', originalRx: 'Tab Amlodipine 5mg 1-0-0', gradient: G.blue }),
  med({ id: 'x-ecosprin', profileId, name: 'Ecosprin', strength: '75mg', times: ['08:00'], food: 'No instruction', status: 'needs_review', originalRx: 'Ecosprin 75 OD — food instruction missing', gradient: G.peach }),
  med({ id: 'x-atorvastatin', profileId, name: 'Atorvastatin', strength: '10mg', timeOfDay: 'Night', times: ['22:00'], food: 'No instruction', status: 'needs_review', originalRx: 'Atorva 10 HS', gradient: G.plum }),
].map((m) => ({ ...m, demo: true }));

let rid = 0;
const r = (p: Partial<HealthReading> & Pick<HealthReading, 'profileId' | 'type' | 'at'>): HealthReading => ({
  id: `demo-r${++rid}`,
  source: 'demo',
  demo: true,
  ...p,
});

export const demoReadings = (): HealthReading[] => [
  // Mother – includes the headline demo record
  r({ profileId: 'mother', type: 'sugar', value: 130, context: 'After meal', contextLabel: 'After breakfast', meal: 'Two rotis and tea', at: daysAgo(0, 9, 15) }),
  r({ profileId: 'mother', type: 'bp', systolic: 128, diastolic: 82, at: daysAgo(0, 9, 20) }),
  r({ profileId: 'mother', type: 'sugar', value: 118, context: 'Fasting', contextLabel: 'Fasting', at: daysAgo(1, 7, 40) }),
  r({ profileId: 'mother', type: 'sugar', value: 152, context: 'After meal', contextLabel: 'After lunch', meal: 'Dal, rice and sabzi', at: daysAgo(2, 14, 10) }),
  r({ profileId: 'mother', type: 'bp', systolic: 134, diastolic: 86, at: daysAgo(2, 9, 0) }),
  r({ profileId: 'mother', type: 'sugar', value: 124, context: 'Fasting', contextLabel: 'Fasting', at: daysAgo(3, 7, 30) }),
  r({ profileId: 'mother', type: 'sugar', value: 141, context: 'After meal', contextLabel: 'After dinner', at: daysAgo(4, 21, 30) }),
  r({ profileId: 'mother', type: 'sugar', value: 122, context: 'Fasting', contextLabel: 'Fasting', at: daysAgo(5, 7, 45) }),
  r({ profileId: 'mother', type: 'bp', systolic: 126, diastolic: 80, at: daysAgo(5, 9, 0) }),
  r({ profileId: 'mother', type: 'sugar', value: 135, context: 'Random', contextLabel: 'Random', at: daysAgo(6, 17, 0) }),
  // Father
  r({ profileId: 'father', type: 'sugar', value: 104, context: 'Fasting', contextLabel: 'Fasting', at: daysAgo(0, 7, 20) }),
  r({ profileId: 'father', type: 'bp', systolic: 142, diastolic: 90, at: daysAgo(0, 7, 30) }),
  r({ profileId: 'father', type: 'bp', systolic: 138, diastolic: 88, at: daysAgo(2, 7, 30) }),
  r({ profileId: 'father', type: 'sugar', value: 110, context: 'Fasting', contextLabel: 'Fasting', at: daysAgo(3, 7, 25) }),
  r({ profileId: 'father', type: 'bp', systolic: 146, diastolic: 92, at: daysAgo(4, 7, 30) }),
  // Ramesh (self) – matches Health History design
  r({ profileId: 'self', type: 'sugar', value: 180, context: 'Fasting', contextLabel: 'Fasting', at: daysAgo(0, 7, 30) }),
  r({ profileId: 'self', type: 'bp', systolic: 130, diastolic: 80, at: daysAgo(1, 9, 0) }),
  r({ profileId: 'self', type: 'sugar', value: 165, context: 'After meal', contextLabel: 'After meal', at: daysAgo(1, 14, 15) }),
  r({ profileId: 'self', type: 'sugar', value: 120, context: 'Fasting', contextLabel: 'Fasting', at: daysAgo(2, 7, 45) }),
  r({ profileId: 'self', type: 'sugar', value: 148, context: 'Fasting', contextLabel: 'Fasting', at: daysAgo(3, 7, 40) }),
  r({ profileId: 'self', type: 'sugar', value: 133, context: 'Fasting', contextLabel: 'Fasting', at: daysAgo(4, 7, 50) }),
  r({ profileId: 'self', type: 'bp', systolic: 136, diastolic: 84, at: daysAgo(5, 9, 0) }),
];

export const demoAppointments = (): Appointment[] => [
  { id: 'a1', profileId: 'self', title: 'Dr. Sharma · Checkup', at: daysAhead(2, 10), reminder: 'Reminder set for Thursday evening', status: 'upcoming', demo: true },
  { id: 'a2', profileId: 'self', title: 'Blood test · Lab', at: daysAhead(5, 8), note: 'Fasting required', status: 'upcoming', demo: true },
  { id: 'a3', profileId: 'self', title: 'Dr. Sharma · Follow-up', at: daysAgo(15, 11), status: 'completed', demo: true },
  { id: 'a4', profileId: 'mother', title: 'Dr. Mehta · Diabetes review', at: daysAhead(3, 11), reminder: 'Reminder the evening before', status: 'upcoming', demo: true },
  { id: 'a5', profileId: 'father', title: 'Dr. Rao · BP check', at: daysAhead(7, 9), status: 'upcoming', demo: true },
];

export const demoEvents = (medicines: Medicine[], now = new Date()): ReminderEvent[] => {
  const today = isoDate(now);
  const out: ReminderEvent[] = [];
  // Keep each profile's last reminder of the day upcoming so the demo always has something to act on.
  const lastTime = new Map<string, string>();
  for (const m of medicines) if (m.status === 'ready') for (const t of m.times) if (t > (lastTime.get(m.profileId) ?? '')) lastTime.set(m.profileId, t);
  for (const m of medicines) {
    if (m.status !== 'ready') continue;
    for (const t of m.times) {
      const [h, mi] = t.split(':').map(Number);
      const when = new Date(now);
      when.setHours(h, mi, 0, 0);
      const past = when.getTime() < now.getTime() && t !== lastTime.get(m.profileId);
      out.push({
        id: `${m.id}-${today}-${t}`,
        profileId: m.profileId,
        medicineId: m.id,
        date: today,
        time: t,
        status: past ? 'taken' : 'upcoming',
        actedAt: past ? new Date(when.getTime() + 4 * 60000).toISOString() : undefined,
        selfReported: past || undefined,
        demo: true,
      });
    }
  }
  return out;
};

export const createDemoState = (): AppState => {
  const medicines = demoMedicines();
  return {
    version: 1,
    onboarding: { done: true, name: 'Ramesh', phone: '98765 43210', purpose: 'self' },
    activeProfileId: 'self',
    profiles: [
      { id: 'self', name: 'Ramesh', relation: 'Me', initial: 'R' },
      { id: 'mother', name: 'Mummy', relation: 'Mother', initial: 'M' },
      { id: 'father', name: 'Papa', relation: 'Father', initial: 'P' },
    ],
    medicines,
    events: demoEvents(medicines),
    readings: demoReadings(),
    appointments: demoAppointments(),
    family: [
      { id: 'f1', name: 'Anita Kumar', relation: 'Daughter', role: 'Admin', status: 'Active', demo: true },
      { id: 'f2', name: 'Vikram Kumar', relation: 'Son', role: 'Read-only', status: 'Pending', demo: true },
    ],
    changeRequests: [
      { id: 'c1', profileId: 'mother', kind: 'change', medicineId: 'm-metformin', oldTimes: ['08:00', '20:00'], newTimes: ['07:30', '20:00'], description: 'Changed: 8 AM → 7:30 AM', by: 'Anita', state: 'Awaiting confirmation', demo: true },
      { id: 'c2', profileId: 'mother', kind: 'new', newName: 'Vitamin D3', newStrength: '60000 IU', newTimes: ['08:00'], description: 'Once daily · Morning · After food', by: 'Anita', state: 'Awaiting confirmation', demo: true },
    ],
    voiceHistory: [
      { id: 'v1', profileId: 'self', at: daysAgo(0, 8, 4), kind: 'reminder-call', summary: 'Reported taking Metformin (self-reported)', demo: true },
      { id: 'v2', profileId: 'self', at: daysAgo(1, 7, 31), kind: 'health-entry', summary: 'Blood sugar 180 mg/dL, fasting', demo: true },
      { id: 'v3', profileId: 'mother', at: daysAgo(0, 9, 16), kind: 'health-entry', summary: 'Blood sugar 130 mg/dL after breakfast; two rotis and tea', demo: true },
    ],
    settings: {
      language: 'हिन्दी', textSize: 'Large', speakingSpeed: 'Normal', reminderTone: 'Gentle',
      quietHours: true, notificationsAllowed: true, micAllowed: true,
      storeSummaries: true, storeVoice: false, voiceCloning: false, deviceOnline: true,
    },
    extraction: null,
  };
};

export const defaultSettings = (): AppState['settings'] => ({
  language: 'हिन्दी', textSize: 'Large', speakingSpeed: 'Normal', reminderTone: 'Gentle',
  quietHours: true, notificationsAllowed: true, micAllowed: true,
  storeSummaries: true, storeVoice: false, voiceCloning: false, deviceOnline: true,
});

/** Signed-in live start: self only, no Ramesh sample family. */
export const blankLiveState = (name = 'You'): AppState => {
  const n = name.trim() || 'You';
  return {
    version: 1,
    onboarding: { done: true, name: n, phone: '', purpose: 'self' },
    activeProfileId: 'self',
    profiles: [{ id: 'self', name: n.split(' ')[0] || n, relation: 'Me', initial: n[0].toUpperCase() }],
    medicines: [],
    events: [],
    readings: [],
    appointments: [],
    family: [],
    changeRequests: [],
    voiceHistory: [],
    settings: defaultSettings(),
    extraction: null,
  };
};

/** Fresh install: empty family, onboarding not done. Demo sample data is loaded only via Reset demo. */
export const createBlankState = (): AppState => {
  const s = blankLiveState('You');
  return {
    ...s,
    onboarding: { done: false, name: '', phone: '', purpose: 'self' },
    profiles: [{ id: 'self', name: 'You', relation: 'Me', initial: 'Y' }],
  };
};
