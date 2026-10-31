import type { AppState, HealthReading, ProfileId } from '../types';
import { liveFlag } from './dataService';

const uid = () => `rd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export type ReadingDraft = Omit<HealthReading, 'id' | 'profileId' | 'at' | 'source' | 'demo'> & { id?: string; at?: string; source?: HealthReading['source'] };

export function addReading(s: AppState, d: ReadingDraft): AppState {
  const r: HealthReading = { ...d, id: d.id ?? uid(), profileId: s.activeProfileId, at: d.at ?? new Date().toISOString(), source: d.source ?? 'manual', demo: liveFlag() };
  return { ...s, readings: [...s.readings, r] };
}
export const updateReading = (s: AppState, id: string, patch: Partial<HealthReading>): AppState => ({
  ...s, readings: s.readings.map((r) => (r.id === id ? { ...r, ...patch } : r)),
});
export const deleteReading = (s: AppState, id: string): AppState => ({ ...s, readings: s.readings.filter((r) => r.id !== id) });

export const readingsFor = (s: AppState, pid: ProfileId = s.activeProfileId) =>
  s.readings.filter((r) => r.profileId === pid).sort((a, b) => b.at.localeCompare(a.at));

export const sugarBand = (v: number) => (v >= 180 ? 'Elevated' : v >= 140 ? 'Borderline' : 'Normal');
export const bpBand = (sys: number, dia: number) => (sys >= 140 || dia >= 90 ? 'Elevated' : sys >= 130 || dia >= 85 ? 'Borderline' : 'Normal');

export const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diff === 0) return `Today, ${t}`;
  if (diff === 1) return `Yesterday, ${t}`;
  if (diff < 7) return `${d.toLocaleDateString('en-IN', { weekday: 'long' })}, ${t}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${t}`;
};

/** Last 7 days of values for the chart (real saved data only). */
export function chartData(readings: HealthReading[], type: 'sugar' | 'bp') {
  const rows = readings.filter((r) => r.type === type).sort((a, b) => a.at.localeCompare(b.at)).slice(-10);
  return rows.map((r) => ({
    label: new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    sugar: r.value, sys: r.systolic, dia: r.diastolic,
  }));
}
