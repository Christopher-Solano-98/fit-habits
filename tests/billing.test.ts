import { describe, expect, it } from 'vitest';
import type { Client, Exercise, ExerciseLog, Payment } from '../supabase/functions/_shared/types.ts';
import { currentPeriod, payStatus } from '../supabase/functions/_shared/billing.ts';
import { addMonths, startOfWeek } from '../supabase/functions/_shared/dates.ts';
import { change, changeWith, goalProgress, parseValue, parseWith } from '../supabase/functions/_shared/metrics.ts';
import { BUILT_IN_EXERCISES, EXERCISE_GROUPS, exerciseDef, exerciseSeries, findExercise, fmtLog, trackDef, trackedExercises } from '../supabase/functions/_shared/exercises.ts';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c', firstName: 'Marcus', lastName: 'Reed', birthDate: null, gender: null, phone: null, email: null, address: null,
  sessionDays: [1, 3, 5], sessionTime: null, rate: 150, cycle: 'weekly', dueWeekday: 1, dueDayOfMonth: 1, channel: 'text',
  medicalCurrent: null, medicalPast: null, emergencyName: null, emergencyPhone: null, notes: null,
  startDate: '2026-01-01', active: true, createdAt: '', ...p,
});
const pay = (paidOn: string, amount = 150): Payment => ({ id: paidOn, clientId: 'c', amount, paidOn, note: null, receiptVia: 'text', createdAt: '' });

describe('dates', () => {
  it('weeks start on Monday', () => {
    expect(startOfWeek('2026-10-23')).toBe('2026-10-19'); // Fri -> Mon
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19'); // Sun -> Mon
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19');
  });
  it('adds months without overflowing short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('weekly billing', () => {
  it('is upcoming before the due day, due on it, late after', () => {
    const c = client({ dueWeekday: 3 }); // Wednesday
    expect(payStatus(c, [], '2026-10-20').state).toBe('upcoming');
    expect(payStatus(c, [], '2026-10-21').state).toBe('due');
    const late = payStatus(c, [], '2026-10-23');
    expect(late.state).toBe('late');
    expect(late.daysLate).toBe(2);
    expect(late.label).toBe('2 days late');
  });
  it('counts a payment anywhere in the week', () => {
    expect(payStatus(client(), [pay('2026-10-19')], '2026-10-23').label).toBe('Paid Oct 19');
  });
  it('last week’s payment does not cover this week', () => {
    expect(payStatus(client(), [pay('2026-10-16')], '2026-10-20').state).toBe('late');
  });
  it('tracks partial payments', () => {
    const s = payStatus(client(), [pay('2026-10-19', 100)], '2026-10-21');
    expect(s.state).toBe('late');
    expect(s.owed).toBe(50);
  });
});

describe('other cycles', () => {
  it('monthly is due on the chosen day and clamps to short months', () => {
    const c = client({ cycle: 'monthly', rate: 560, dueDayOfMonth: 31 });
    expect(currentPeriod(c, '2026-02-10').due).toBe('2026-02-28');
    expect(payStatus(c, [pay('2026-02-03', 560)], '2026-02-27').state).toBe('paid');
  });
  it('biweekly periods are 14 days anchored to the start week', () => {
    const c = client({ cycle: 'biweekly', startDate: '2026-10-05' });
    expect(currentPeriod(c, '2026-10-14')).toMatchObject({ start: '2026-10-05', end: '2026-10-18' });
    expect(currentPeriod(c, '2026-10-20')).toMatchObject({ start: '2026-10-19', end: '2026-11-01' });
  });
  it('per-session is due on each session day', () => {
    const c = client({ cycle: 'per_session', rate: 50, sessionDays: [6] }); // Saturdays
    expect(payStatus(c, [], '2026-10-24').state).toBe('due');
    expect(payStatus(c, [pay('2026-10-24', 50)], '2026-10-26').state).toBe('paid');
    expect(payStatus(c, [pay('2026-10-17', 50)], '2026-10-26').state).toBe('late');
  });
  it('inactive clients and $0 rates are never due', () => {
    expect(payStatus(client({ active: false }), [], '2026-10-23').state).toBe('none');
    expect(payStatus(client({ rate: 0 }), [], '2026-10-23').state).toBe('none');
  });
});

describe('metrics', () => {
  it('describes body fat change in points and judges direction', () => {
    const ch = change('bodyFat', [{ date: '2025-10-01', value: 18 }, { date: '2026-10-01', value: 8 }]);
    expect(ch).toMatchObject({ text: 'Down 10 pts', good: true });
    expect(change('weight', [{ date: 'a', value: 180 }, { date: 'b', value: 186 }])).toMatchObject({ text: 'Up 6 lb', good: false });
  });
  it('parses numbers', () => {
    expect(parseValue('weight', '191.5')).toBe(191.5);
    expect(parseValue('weight', '')).toBeNull();
  });
  it('goal progress runs from first value to target', () => {
    const g = { id: 'g', clientId: 'c', metric: 'ex:b-mile', target: 420, byDate: null, createdAt: '' };
    expect(goalProgress(g, [{ date: 'a', value: 600 }, { date: 'b', value: 510 }])).toBeCloseTo(0.5);
  });
});

describe('exercises', () => {
  const log = (exerciseId: string, date: string, value: number, reps: number | null = null): ExerciseLog =>
    ({ id: date + value, clientId: 'c', exerciseId, date, value, reps, note: null, createdAt: '' });

  it('judges direction by kind: heavier/more is better, faster is better for time', () => {
    const squat = findExercise('b-back-squat', [])!;
    const mile = findExercise('b-mile', [])!;
    expect(changeWith(exerciseDef(squat), [{ date: 'a', value: 225 }, { date: 'b', value: 205 }])).toMatchObject({ text: 'Down 20 lb', good: false });
    expect(changeWith(exerciseDef(mile), [{ date: 'a', value: 590 }, { date: 'b', value: 462 }])).toMatchObject({ text: 'Down 2:08', good: true });
  });
  it('formats and parses entries', () => {
    expect(fmtLog(findExercise('b-bench', [])!, { value: 185, reps: 5 })).toBe('185 lb × 5');
    expect(fmtLog(findExercise('b-pullups', [])!, { value: 12, reps: null })).toBe('12 reps');
    expect(fmtLog(findExercise('b-plank', [])!, { value: 90, reps: null })).toBe('1:30');
    expect(parseWith(exerciseDef(findExercise('b-mile', [])!), '7:42')).toBe(462);
  });
  it('custom exercises work like built-ins', () => {
    const sled: Exercise = { id: 'x1', name: 'Sled push', group: 'Legs', kind: 'time', createdAt: '' };
    expect(findExercise('x1', [sled])?.name).toBe('Sled push');
    expect(trackDef('ex:x1', [sled])).toMatchObject({ label: 'Sled push', better: 'down', time: true });
    expect(trackDef('bodyFat', [])?.label).toBe('Body fat');
  });
  it('lists a client’s exercises, most recently logged first', () => {
    const logs = [log('b-bench', '2026-10-01', 185), log('b-pullups', '2026-11-01', 10), log('b-bench', '2026-09-01', 175)];
    expect(trackedExercises(logs, 'c', []).map((e) => e.id)).toEqual(['b-pullups', 'b-bench']);
    expect(exerciseSeries(logs, 'c', 'b-bench').map((p) => p.value)).toEqual([175, 185]);
  });
  it('every built-in exercise has a unique id and a known body part', () => {
    expect(new Set(BUILT_IN_EXERCISES.map((e) => e.id)).size).toBe(BUILT_IN_EXERCISES.length);
    for (const e of BUILT_IN_EXERCISES) expect(EXERCISE_GROUPS).toContain(e.group);
  });
});

import { scheduleText, timeOn } from '../supabase/functions/_shared/messages.ts';
describe('different times on different days', () => {
  it('shows each group of days with its own time', () => {
    const c = client({ sessionDays: [1, 2, 3, 4], sessionTime: null, sessionTimes: { 1: '8:00 AM', 3: '8:00 AM', 2: '10:00 AM', 4: '10:00 AM' } });
    expect(scheduleText(c)).toBe('Mon & Wed · 8:00 AM, Tue & Thu · 10:00 AM');
    expect(timeOn(c, 2)).toBe('10:00 AM');
  });
  it('falls back to the one time when a day has none', () => {
    const c = client({ sessionDays: [1, 3, 5], sessionTime: '6:00 AM', sessionTimes: { 5: '7:00 AM' } });
    expect(scheduleText(c)).toBe('Mon & Wed · 6:00 AM, Fri · 7:00 AM');
    expect(scheduleText(client({ sessionDays: [1, 3, 5], sessionTime: '6:00 AM' }))).toBe('Mon, Wed & Fri · 6:00 AM');
  });
});
