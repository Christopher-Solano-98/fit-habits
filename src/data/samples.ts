import type { Client, Goal, Measurement, MetricKey, Payment, Snapshot } from '@shared/types.ts';
import { addDays, addMonths, startOfWeek, todayIso } from '@shared/dates.ts';
import { defaultMotivations, defaultSettings, defaultTemplates } from './defaults';
import { nowIso, uid } from './repo';

// Demo data built relative to today so the dashboard always looks "live".
export function sampleSnapshot(): Snapshot {
  const today = todayIso();
  const monday = startOfWeek(today);
  const created = nowIso();

  const base = (c: Partial<Client> & Pick<Client, 'firstName' | 'lastName'>): Client => ({
    id: uid(), birthDate: null, gender: null, phone: null, email: null, address: null,
    sessionDays: [], sessionTime: null, rate: 0, cycle: 'weekly', dueWeekday: 1, dueDayOfMonth: 1,
    channel: 'text', medicalCurrent: null, medicalPast: null, emergencyName: null, emergencyPhone: null,
    notes: null, startDate: addMonths(today, -6), active: true, createdAt: created, ...c,
  });

  const clients: Client[] = [
    base({ firstName: 'Marcus', lastName: 'Reed', birthDate: '1992-03-14', gender: 'Male', phone: '(555) 201-4410', email: 'marcus@example.com', address: '1420 Oak Ridge Dr, Apt 3B', sessionDays: [1, 3, 5], sessionTime: '6:00 AM', rate: 150, dueWeekday: 1, medicalCurrent: 'None reported', medicalPast: 'ACL repair, left knee (2019)', startDate: addMonths(today, -13) }),
    base({ firstName: 'Tasha', lastName: 'Greene', birthDate: '1985-07-02', gender: 'Female', phone: '(555) 318-7702', email: 'tasha@example.com', address: '88 Willow Ct', sessionDays: [1, 3], sessionTime: '7:30 AM', rate: 150, dueWeekday: 1, medicalCurrent: 'Mild lower-back stiffness', medicalPast: 'None reported', startDate: addMonths(today, -9) }),
    base({ firstName: 'Devon', lastName: 'Carter', birthDate: '1998-11-20', gender: 'Male', phone: '(555) 442-1937', email: 'devon@example.com', address: '510 Grant Ave', sessionDays: [1, 5], sessionTime: '5:30 PM', rate: 120, dueWeekday: 1, medicalPast: 'Sprained right ankle (2023)', startDate: addMonths(today, -14) }),
    base({ firstName: 'Linda', lastName: 'Morales', birthDate: '1963-01-09', gender: 'Female', phone: '(555) 627-0081', email: 'linda@example.com', address: '2 Lakeview Terrace', sessionDays: [3, 5], sessionTime: '10:00 AM', rate: 75, dueWeekday: 3, medicalCurrent: 'Controlled high blood pressure', medicalPast: 'Hip replacement (2021)', startDate: addMonths(today, -7) }),
    base({ firstName: 'Jordan', lastName: 'Blake', birthDate: '2004-05-30', gender: 'Male', phone: '(555) 730-5526', email: 'jordan@example.com', address: '77 College St, Unit 12', sessionDays: [6], sessionTime: '9:00 AM', rate: 50, cycle: 'per_session', startDate: addMonths(today, -2) }),
    base({ firstName: 'Aisha', lastName: 'Bennett', birthDate: '1989-09-17', gender: 'Female', phone: '(555) 815-3349', email: 'aisha@example.com', address: '1903 Pine Hollow Rd', sessionDays: [2, 4], sessionTime: '12:00 PM', rate: 560, cycle: 'monthly', dueDayOfMonth: 1, channel: 'email', medicalCurrent: 'Asthma (inhaler on hand)', startDate: addMonths(today, -12) }),
  ];
  const [marcus, tasha, devon, linda, jordan, aisha] = clients;

  const payments: Payment[] = [];
  const pay = (c: Client, paidOn: string, amount = c.rate) =>
    payments.push({ id: uid(), clientId: c.id, amount, paidOn, note: null, receiptVia: c.channel, createdAt: created });

  // Weekly payers: 10 weeks of history. Marcus and Linda haven't paid this week yet.
  for (let w = 1; w <= 10; w++) {
    const wk = addDays(monday, -7 * w);
    pay(marcus, wk); pay(tasha, wk); pay(devon, addDays(wk, 4)); pay(linda, addDays(wk, 2));
  }
  if (today > monday) pay(tasha, monday);
  if (today >= addDays(monday, 0)) pay(devon, monday);
  // Per-session: Jordan pays each Saturday.
  for (let w = 1; w <= 8; w++) pay(jordan, addDays(monday, -7 * w + 5));
  // Monthly: Aisha paid the last few months, not this one yet.
  for (let m = 1; m <= 4; m++) pay(aisha, addMonths(today.slice(0, 8) + '01', -m));

  const measurements: Measurement[] = [];
  const measure = (c: Client, monthsAgo: number, values: Partial<Record<MetricKey, number>>) =>
    measurements.push({ id: uid(), clientId: c.id, takenOn: addMonths(today, -monthsAgo), values, note: null, fileId: null, createdAt: created });

  measure(marcus, 12, { weight: 212, bodyFat: 18, waist: 38, restingHr: 72, pushups: 28, mile: 590, squat: 225 });
  measure(marcus, 8, { weight: 204, bodyFat: 15, waist: 36.5, restingHr: 68, pushups: 34, mile: 545, squat: 255 });
  measure(marcus, 4, { weight: 197, bodyFat: 12, waist: 35, restingHr: 64, pushups: 41, mile: 500, squat: 275 });
  measure(marcus, 0, { weight: 191, bodyFat: 8, waist: 33.5, restingHr: 60, pushups: 47, mile: 462, squat: 295 });
  measure(tasha, 8, { weight: 168, bodyFat: 31, waist: 33, hips: 41 });
  measure(tasha, 4, { weight: 161, bodyFat: 28, waist: 31.5, hips: 40 });
  measure(tasha, 1, { weight: 157, bodyFat: 27, waist: 30.5, hips: 39.5 });
  measure(devon, 12, { weight: 178, bodyFat: 22, bench: 155, deadlift: 245 });
  measure(devon, 7, { weight: 181, bodyFat: 19, bench: 185, deadlift: 285 });
  measure(devon, 3, { weight: 184, bodyFat: 17, bench: 205, deadlift: 315 });
  measure(linda, 6, { weight: 172, bodyFat: 36, systolic: 142, diastolic: 90, restingHr: 78 });
  measure(linda, 2, { weight: 166, bodyFat: 33, systolic: 132, diastolic: 84, restingHr: 74 });
  measure(aisha, 11, { weight: 158, bodyFat: 29, plank: 45 });
  measure(aisha, 7, { weight: 154, bodyFat: 27, plank: 75 });
  measure(aisha, 3, { weight: 149, bodyFat: 24, plank: 110 });

  const goals: Goal[] = [
    { id: uid(), clientId: marcus.id, metric: 'mile', target: 420, byDate: addMonths(today, 4), createdAt: created },
    { id: uid(), clientId: tasha.id, metric: 'weight', target: 150, byDate: addMonths(today, 3), createdAt: created },
    { id: uid(), clientId: devon.id, metric: 'deadlift', target: 365, byDate: null, createdAt: created },
    { id: uid(), clientId: linda.id, metric: 'systolic', target: 125, byDate: null, createdAt: created },
  ];

  return {
    settings: defaultSettings(),
    clients, payments, measurements, goals,
    files: [],
    templates: defaultTemplates(),
    motivations: defaultMotivations(),
    intakes: [],
  };
}

export function emptySnapshot(): Snapshot {
  return {
    settings: defaultSettings(), clients: [], payments: [], measurements: [], goals: [], files: [],
    templates: defaultTemplates(), motivations: defaultMotivations(), intakes: [],
  };
}
