import assert from 'node:assert/strict';
import {
  doseFace, normalizeClock, occurrenceId, resizeTimes, scheduleRowId, validateTimes,
} from '../src/services/scheduleUtils.ts';
import { createBlankState, createDemoState, isoDate } from '../src/data/demoData.ts';
import { addMedicine } from '../src/services/medicineService.ts';
import { markSkipped, markTaken, regenerateEvents, tickReminders, undoDose } from '../src/services/reminderService.ts';
import type { AppState, Medicine } from '../src/types/index.ts';

const med = (p: Partial<Medicine> & Pick<Medicine, 'id' | 'profileId' | 'times'>): Medicine => ({
  name: 'Metformin', strength: '500mg', dose: '1 tablet', frequency: 'Once daily', timeOfDay: 'Morning',
  food: 'After food', duration: 'Ongoing', startedOn: '2026-01-01', status: 'ready', gradient: ['#E7EDE2', '#B5C4A0'],
  ...p,
});

const blank = (medicines: Medicine[], events: AppState['events'] = []): AppState => ({
  version: 1,
  onboarding: { done: true, name: 'Test', phone: '', purpose: 'self' },
  activeProfileId: 'self',
  profiles: [
    { id: 'self', name: 'Me', relation: 'Me', initial: 'M' },
    { id: 'mother', name: 'Mummy', relation: 'Mother', initial: 'U' },
    { id: 'father', name: 'Papa', relation: 'Father', initial: 'P' },
  ],
  medicines, events, readings: [], appointments: [], family: [], changeRequests: [], voiceHistory: [],
  settings: { language: 'English', textSize: 'Standard', speakingSpeed: 'Normal', reminderTone: 'Gentle', quietHours: false, notificationsAllowed: false, micAllowed: false, storeSummaries: true, storeVoice: false, voiceCloning: false, deviceOnline: true },
  extraction: null,
});

function check(name: string, fn: () => void) {
  fn();
  console.log('PASS', name);
}

check('normalize 05:51 and 10:30 PM-style 22:30', () => {
  assert.equal(normalizeClock('05:51'), '05:51');
  assert.equal(normalizeClock('5:51'), '05:51');
  assert.equal(normalizeClock('22:30'), '22:30');
  assert.equal(normalizeClock('25:00'), null);
});

check('validate duplicate and missing times', () => {
  assert.ok(validateTimes(['05:51', '05:51']).error);
  assert.ok(validateTimes(['']).error);
  assert.equal(validateTimes(['05:51', '20:30']).error, null);
});

check('frequency slots', () => {
  assert.deepEqual(resizeTimes('Twice daily', []), ['08:00', '20:00']);
  assert.equal(resizeTimes('Three times daily', []).length, 3);
  assert.equal(resizeTimes('Custom', ['09:15', '21:05']).length, 2);
});

const at = (h: number, m: number, date = '2026-10-31') => {
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
};

check('05:51 upcoming before and due after', () => {
  assert.equal(doseFace('upcoming', '2026-10-31', '05:51', at(5, 50)), 'upcoming');
  assert.equal(doseFace('upcoming', '2026-10-31', '05:51', at(5, 51)), 'due');
  assert.equal(doseFace('upcoming', '2026-10-31', '05:51', at(8, 0)), 'overdue');
});

check('create 05:51 occurrence for today', () => {
  const s = regenerateEvents(blank([med({ id: 'm1', profileId: 'self', times: ['05:51'] })]), at(4, 0));
  const e = s.events.find((x) => x.medicineId === 'm1');
  assert.ok(e);
  assert.equal(e!.time, '05:51');
  assert.equal(e!.id, occurrenceId('m1', '2026-10-31', '05:51'));
  assert.equal(doseFace(e!.status, e!.date, e!.time, at(4, 0)), 'upcoming');
  assert.equal(doseFace(e!.status, e!.date, e!.time, at(6, 0)), 'due');
});

check('refresh still detects pending 05:51 as due', () => {
  const first = regenerateEvents(blank([med({ id: 'm1', profileId: 'self', times: ['05:51'] })]), at(6, 0));
  const again = regenerateEvents(first, at(6, 5));
  const e = again.events.find((x) => x.id === occurrenceId('m1', '2026-10-31', '05:51'));
  assert.ok(e);
  assert.equal(e!.status, 'upcoming');
  assert.equal(doseFace(e!.status, e!.date, e!.time, at(6, 5)), 'due');
});

check('twice daily two exact times', () => {
  const s = regenerateEvents(blank([med({ id: 'm2', profileId: 'self', frequency: 'Twice daily', times: ['05:51', '20:30'] })]), at(12, 0));
  const times = s.events.filter((e) => e.medicineId === 'm2').map((e) => e.time).sort();
  assert.deepEqual(times, ['05:51', '20:30']);
});

check('edit time replaces old upcoming occurrence', () => {
  let s = regenerateEvents(blank([med({ id: 'm3', profileId: 'self', times: ['05:51'] })]), at(4, 0));
  s = { ...s, medicines: s.medicines.map((m) => (m.id === 'm3' ? { ...m, times: ['06:10'] } : m)) };
  s = regenerateEvents(s, at(4, 0));
  assert.equal(s.events.some((e) => e.time === '05:51' && e.status === 'upcoming'), false);
  assert.equal(s.events.some((e) => e.time === '06:10' && e.medicineId === 'm3'), true);
});

check('taken/skip/undo stay consistent', () => {
  let s = regenerateEvents(blank([med({ id: 'm4', profileId: 'self', times: ['08:00'] })]), at(8, 1));
  const id = occurrenceId('m4', '2026-10-31', '08:00');
  s = markTaken(s, id);
  assert.equal(s.events.find((e) => e.id === id)?.status, 'taken');
  s = undoDose(s, id);
  assert.equal(s.events.find((e) => e.id === id)?.status, 'upcoming');
  s = markSkipped(s, id);
  assert.equal(s.events.find((e) => e.id === id)?.status, 'skipped');
});

check('mother and father schedules stay separate', () => {
  const s = regenerateEvents(blank([
    med({ id: 'mom', profileId: 'mother', times: ['07:15'] }),
    med({ id: 'dad', profileId: 'father', times: ['19:40'] }),
  ]), at(8, 0));
  const mom = s.events.find((e) => e.medicineId === 'mom');
  const dad = s.events.find((e) => e.medicineId === 'dad');
  assert.equal(mom?.profileId, 'mother');
  assert.equal(dad?.profileId, 'father');
  assert.equal(mom?.time, '07:15');
  assert.equal(dad?.time, '19:40');
});

check('regenerate does not duplicate the same dose', () => {
  const first = regenerateEvents(blank([med({ id: 'm5', profileId: 'self', times: ['05:51', '5:51'] })]), at(4, 0));
  const again = regenerateEvents(first, at(4, 1));
  const n = again.events.filter((e) => e.medicineId === 'm5').length;
  assert.equal(n, 1);
});

check('overdue is persisted as missed on tick', () => {
  let s = regenerateEvents(blank([med({ id: 'm6', profileId: 'self', times: ['05:51'] })]), at(4, 0));
  s = tickReminders(s, at(8, 0));
  assert.equal(s.events.find((e) => e.medicineId === 'm6')?.status, 'missed');
});

check('addMedicine uses the active family member and local start date', () => {
  const s = addMedicine({ ...blank([]), activeProfileId: 'mother' }, {
    name: 'Metformin', strength: '500mg', dose: '1 tablet', frequency: 'Once daily',
    timeOfDay: 'Morning', times: ['05:51'], food: 'After food', duration: 'Ongoing',
  });
  const m = s.medicines[0];
  assert.equal(m.profileId, 'mother');
  assert.equal(m.times[0], '05:51');
  assert.equal(m.startedOn, isoDate(new Date()));
  assert.equal(s.events[0]?.profileId, 'mother');
});

check('schedule row id is per dose time', () => {
  assert.equal(scheduleRowId('abc', '05:51'), 'sch_abc_0551');
  assert.notEqual(scheduleRowId('abc', '05:51'), scheduleRowId('abc', '20:30'));
});

check('first visit is empty onboarding; demo sample stays on Reset demo', () => {
  const fresh = createBlankState();
  assert.equal(fresh.onboarding.done, false);
  assert.equal(fresh.medicines.length, 0);
  assert.equal(fresh.readings.length, 0);
  const demo = createDemoState();
  assert.equal(demo.onboarding.done, true);
  assert.ok(demo.medicines.every((m) => m.demo === true));
});

console.log('\nAll schedule/reminder unit checks passed.');
