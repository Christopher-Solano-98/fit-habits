import { describe, expect, it } from 'vitest';
import type { Client, Payment } from '../supabase/functions/_shared/types.ts';
import { currentPeriod, payStatus } from '../supabase/functions/_shared/billing.ts';
import { addMonths, startOfWeek } from '../supabase/functions/_shared/dates.ts';
import { change, goalProgress, parseValue } from '../supabase/functions/_shared/metrics.ts';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c', firstName: 'Marcus', lastName: 'Reed', birthDate: null, gender: null, phone: null, email: null, address: null,
  sessionDays: [1, 3, 5], sessionTime: null, rate: 150, cycle: 'weekly', dueWeekday: 1, dueDayOfMonth: 1, channel: 'text',
  medicalCurrent: null, medicalPast: null, emergencyName: null, emergencyPhone: null, notes: null,
  startDate: '2026-01-01', active: true, createdAt: '', ...p,
});
const pay = (paidOn: string, amount = 150): Payment => ({ id: paidOn, clientId: 'c', amount, paidOn, method: 'cash', note: null, receiptVia: 'text', createdAt: '' });

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
    expect(change('squat', [{ date: 'a', value: 225 }, { date: 'b', value: 205 }])?.good).toBe(false);
  });
  it('parses m:ss times', () => {
    expect(parseValue('mile', '7:42')).toBe(462);
    expect(parseValue('weight', '191.5')).toBe(191.5);
    expect(parseValue('weight', '')).toBeNull();
  });
  it('goal progress runs from first value to target', () => {
    const g = { id: 'g', clientId: 'c', metric: 'mile' as const, target: 420, byDate: null, createdAt: '' };
    expect(goalProgress(g, [{ date: 'a', value: 600 }, { date: 'b', value: 510 }])).toBeCloseTo(0.5);
  });
});
