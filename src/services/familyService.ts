import type { AppState, ChangeRequest, FamilyMember, ProfileId, SyncState } from '../types';
import { regenerateEvents } from './reminderService';

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;

/** Simulated invitation: no message is actually sent. */
export function inviteMember(s: AppState, name: string, relation: string, role: FamilyMember['role']): AppState {
  return { ...s, family: [...s.family, { id: uid('fam'), name, relation, role, status: 'Pending' }] };
}
export const removeMember = (s: AppState, id: string): AppState => ({ ...s, family: s.family.filter((f) => f.id !== id) });
export const setRole = (s: AppState, id: string, role: FamilyMember['role']): AppState => ({
  ...s, family: s.family.map((f) => (f.id === id ? { ...f, role } : f)),
});
export const acceptInvite = (s: AppState, id: string): AppState => ({
  ...s, family: s.family.map((f) => (f.id === id ? { ...f, status: 'Active' } : f)),
});

export const requestsFor = (s: AppState, pid: ProfileId) => s.changeRequests.filter((c) => c.profileId === pid);

export function proposeNewMedicine(s: AppState, pid: ProfileId, name: string, strength: string): AppState {
  const c: ChangeRequest = {
    id: uid('cr'), profileId: pid, kind: 'new', newName: name, newStrength: strength, newTimes: ['08:00'],
    description: 'Once daily · Morning · After food', by: 'You', state: 'Draft',
  };
  return { ...s, changeRequests: [...s.changeRequests, c] };
}

const setState = (s: AppState, id: string, state: ChangeRequest['state']): AppState => ({
  ...s, changeRequests: s.changeRequests.map((c) => (c.id === id ? { ...c, state } : c)),
});

/** Draft -> Awaiting confirmation (parent must approve). If the device is offline, stay Draft. */
export function sendForConfirmation(s: AppState, pid: ProfileId): AppState {
  if (!s.settings.deviceOnline) return s;
  return {
    ...s,
    changeRequests: s.changeRequests.map((c) => (c.profileId === pid && c.state === 'Draft' ? { ...c, state: 'Awaiting confirmation' } : c)),
  };
}

/** Parent approves: schedule is changed, state becomes Sync pending (demo sync advances it later). */
export function approveRequest(s: AppState, id: string): AppState {
  const c = s.changeRequests.find((x) => x.id === id);
  if (!c) return s;
  let next = s;
  if (c.kind === 'change' && c.medicineId) {
    next = { ...next, medicines: next.medicines.map((m) => (m.id === c.medicineId ? { ...m, times: c.newTimes ?? m.times } : m)) };
  } else if (c.kind === 'new' && c.newName) {
    next = {
      ...next,
      medicines: [...next.medicines, {
        id: uid('med'), profileId: c.profileId, name: c.newName, strength: c.newStrength ?? '', dose: '1 tablet',
        frequency: 'Once daily', timeOfDay: 'Morning', times: c.newTimes ?? ['08:00'], food: 'After food', duration: 'Ongoing',
        startedOn: new Date().toISOString().slice(0, 10), status: 'ready', gradient: ['#F3D6C6', '#D98255'],
      }],
    };
  }
  return regenerateEvents(setState(next, id, 'Sync pending'));
}
export const rejectRequest = (s: AppState, id: string): AppState => setState(s, id, 'Declined');
/** Demo-only: pretends the server confirmed sync. Labelled DEMO in UI. */
export const completeSync = (s: AppState): AppState => ({
  ...s, changeRequests: s.changeRequests.map((c) => (c.state === 'Sync pending' ? { ...c, state: 'Synced' as SyncState } : c)),
});

export const pendingConfirmations = (s: AppState, pid: ProfileId) =>
  s.changeRequests.filter((c) => c.profileId === pid && c.state === 'Awaiting confirmation');
