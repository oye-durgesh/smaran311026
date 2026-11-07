import type { AppState, FoodInstruction, Frequency, Medicine, ProfileId, TimeOfDay } from '../types';
import { demoExtraction, isoDate } from '../data/demoData';
import { liveFlag } from './dataService';
import { regenerateEvents } from './reminderService';
import { normalizeFrequency, suggestedTimes, validateTimes } from './scheduleUtils';

export const medicineLabel = (m: Pick<Medicine, 'name' | 'strength'>) => `${m.name} ${m.strength}`.trim();

export const timesFor = (frequency: Frequency, tod: TimeOfDay): string[] => suggestedTimes(normalizeFrequency(frequency), tod);

export const mine = (s: AppState, pid: ProfileId = s.activeProfileId) => s.medicines.filter((m) => m.profileId === pid);
export const activeMedicines = (s: AppState, pid?: ProfileId) => mine(s, pid).filter((m) => !m.completed);
export const confirmedCount = (s: AppState, pid?: ProfileId) => activeMedicines(s, pid).filter((m) => m.status === 'ready').length;

export const setupStatus = (s: AppState, pid?: ProfileId): 'Not set up' | 'Needs review' | 'Ready' | 'Paused' => {
  const meds = activeMedicines(s, pid);
  if (!meds.length) return 'Not set up';
  if (meds.some((m) => m.status === 'needs_review' || m.status === 'unconfigured')) return 'Needs review';
  if (meds.every((m) => m.status === 'paused')) return 'Paused';
  return 'Ready';
};

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface MedicineInput {
  name: string;
  strength: string;
  dose: string;
  frequency: Frequency;
  timeOfDay: TimeOfDay;
  times?: string[];
  food: FoodInstruction;
  duration: Medicine['duration'];
  courseDays?: number;
}

export function addMedicine(s: AppState, input: MedicineInput): AppState {
  const frequency = normalizeFrequency(input.frequency);
  const checked = validateTimes(input.times ?? timesFor(frequency, input.timeOfDay));
  if (checked.error) return s;
  const m: Medicine = {
    id: uid('med'),
    profileId: s.activeProfileId,
    name: input.name.trim(),
    strength: input.strength.trim(),
    dose: input.dose.trim() || '1 tablet',
    frequency,
    timeOfDay: input.timeOfDay,
    times: checked.times,
    food: input.food,
    duration: input.duration,
    courseDays: input.courseDays,
    startedOn: isoDate(new Date()),
    status: 'ready', // user entered it directly and confirmed with "Add medicine"
    gradient: ['#E7EDE2', '#B5C4A0'],
    demo: liveFlag(),
  };
  return regenerateEvents({ ...s, medicines: [...s.medicines, m] });
}

export function updateMedicine(s: AppState, id: string, patch: Partial<Medicine>): AppState {
  const next = s.medicines.map((m) => {
    if (m.id !== id) return m;
    const merged = { ...m, ...patch, frequency: normalizeFrequency(patch.frequency ?? m.frequency) };
    if (patch.times) {
      const checked = validateTimes(patch.times);
      if (checked.error) return m;
      merged.times = checked.times;
    }
    return merged;
  });
  return regenerateEvents({ ...s, medicines: next });
}

export function removeMedicine(s: AppState, id: string): AppState {
  return { ...s, medicines: s.medicines.filter((m) => m.id !== id), events: s.events.filter((e) => e.medicineId !== id) };
}

export function togglePause(s: AppState, id: string): AppState {
  const m = s.medicines.find((x) => x.id === id);
  if (!m) return s;
  const status = m.status === 'paused' ? 'ready' : 'paused';
  return updateMedicine(s, id, { status });
}

// ---- Prescription scan (demo extraction) ----
export function startExtraction(s: AppState): AppState {
  return { ...s, extraction: { items: demoExtraction(s.activeProfileId), reviewed: [] } };
}

/** Confirm a single extracted medicine after the user reviewed it. */
export function confirmExtracted(s: AppState, id: string, patch: Partial<Medicine>): AppState {
  if (!s.extraction) return s;
  return {
    ...s,
    extraction: {
      items: s.extraction.items.map((m) => (m.id === id ? { ...m, ...patch, status: 'ready' } : m)),
      reviewed: Array.from(new Set([...s.extraction.reviewed, id])),
    },
  };
}

export function removeExtracted(s: AppState, id: string): AppState {
  if (!s.extraction) return s;
  return { ...s, extraction: { ...s.extraction, items: s.extraction.items.filter((m) => m.id !== id) } };
}

export function addExtractedManual(s: AppState, m: MedicineInput): AppState {
  if (!s.extraction) return s;
  const item: Medicine = {
    id: uid('x'), profileId: s.activeProfileId, ...m, name: m.name.trim(), frequency: normalizeFrequency(m.frequency), times: validateTimes(m.times ?? timesFor(m.frequency, m.timeOfDay)).times,
    startedOn: isoDate(new Date()), status: 'needs_review', gradient: ['#E7EDE2', '#B5C4A0'],
  };
  return { ...s, extraction: { ...s.extraction, items: [...s.extraction.items, item] } };
}

export const extractionIssues = (s: AppState) => (s.extraction?.items ?? []).filter((m) => m.status !== 'ready');

/** Activate: only when every extracted medicine has been confirmed. */
export function activateExtraction(s: AppState): AppState {
  if (!s.extraction || extractionIssues(s).length) return s;
  const incoming = s.extraction.items.map((m) => ({ ...m, id: m.id.startsWith('med_') ? m.id : uid('med'), profileId: s.activeProfileId, demo: liveFlag(), status: 'ready' as const }));
  const keep = s.medicines.filter(
    (m) => !(m.profileId === s.activeProfileId && incoming.some((i) => i.name === m.name && i.strength === m.strength)),
  );
  return regenerateEvents({ ...s, medicines: [...keep, ...incoming], extraction: null });
}

/** "Save and finish later": keep everything, but unconfirmed ones stay out of the schedule. */
export function saveExtractionDraft(s: AppState): AppState {
  if (!s.extraction) return s;
  const incoming = s.extraction.items.map((m) => ({ ...m, id: uid('med'), profileId: s.activeProfileId, demo: liveFlag() }));
  const keep = s.medicines.filter(
    (m) => !(m.profileId === s.activeProfileId && incoming.some((i) => i.name === m.name && i.strength === m.strength)),
  );
  return regenerateEvents({ ...s, medicines: [...keep, ...incoming], extraction: null });
}

export function applyConfirmedMedicines(s: AppState, incoming: Medicine[]): AppState {
  if (!incoming.length) return { ...s, extraction: null };
  const keep = s.medicines.filter(
    (m) => !(m.profileId === s.activeProfileId && incoming.some((i) => i.id === m.id || (i.name === m.name && i.strength === m.strength))),
  );
  return regenerateEvents({ ...s, medicines: [...keep, ...incoming], extraction: null });
}
