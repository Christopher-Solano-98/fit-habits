import type { Client, Payment } from './types.ts';
import { addDays, addMonths, diffDays, endOfMonth, fmtShort, inRange, startOfMonth, startOfWeek, weekday, WEEKDAYS_SHORT } from './dates.ts';

export interface Period {
  start: string;
  end: string;
  due: string;
}

/** The billing period that contains `today` for this client. */
export function currentPeriod(c: Client, today: string): Period {
  switch (c.cycle) {
    case 'weekly': {
      const start = startOfWeek(today);
      return { start, end: addDays(start, 6), due: dueInWeek(start, c.dueWeekday) };
    }
    case 'biweekly': {
      const anchor = startOfWeek(c.startDate);
      const weeks = Math.floor(diffDays(startOfWeek(today), anchor) / 7);
      const start = addDays(anchor, Math.floor(weeks / 2) * 14);
      return { start, end: addDays(start, 13), due: dueInWeek(start, c.dueWeekday) };
    }
    case 'monthly': {
      const start = startOfMonth(today);
      const end = endOfMonth(today);
      const day = Math.min(Math.max(c.dueDayOfMonth, 1), Number(end.slice(8)));
      return { start, end, due: start.slice(0, 8) + String(day).padStart(2, '0') };
    }
    case 'per_session': {
      // Each session is its own "period": from the most recent session day up to the day before the next.
      const last = lastSessionOnOrBefore(c, today);
      if (!last) return { start: today, end: today, due: addDays(today, 365) };
      const next = nextSessionAfter(c, last);
      return { start: last, end: addDays(next, -1), due: last };
    }
  }
}

function dueInWeek(monday: string, dueWeekday: number): string {
  // Monday-based offset (Sunday counts as the last day of the week).
  const offset = dueWeekday === 0 ? 6 : dueWeekday - 1;
  return addDays(monday, offset);
}

function lastSessionOnOrBefore(c: Client, today: string): string | null {
  if (!c.sessionDays.length) return null;
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    if (d < c.startDate) return null;
    if (c.sessionDays.includes(weekday(d))) return d;
  }
  return null;
}

function nextSessionAfter(c: Client, from: string): string {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(from, i);
    if (c.sessionDays.includes(weekday(d))) return d;
  }
  return addDays(from, 7);
}

export type PayState = 'paid' | 'upcoming' | 'due' | 'late' | 'none';

export interface PayStatus {
  state: PayState;
  period: Period;
  paidAmount: number;
  owed: number;
  daysLate: number;
  label: string; // "Paid Oct 20", "Due today", "3 days late", "Due Fri"
  lastPayment: Payment | null;
}

export function payStatus(c: Client, payments: Payment[], today: string): PayStatus {
  const mine = payments.filter((p) => p.clientId === c.id).sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1));
  const lastPayment = mine[0] ?? null;
  const period = currentPeriod(c, today);
  const paidAmount = mine.filter((p) => inRange(p.paidOn, period.start, period.end)).reduce((t, p) => t + p.amount, 0);
  const base = { period, paidAmount, owed: Math.max(c.rate - paidAmount, 0), lastPayment };

  if (!c.active || c.rate <= 0 || today < c.startDate || (c.cycle === 'per_session' && period.due > today)) {
    return { ...base, state: 'none', daysLate: 0, label: 'No payment due' };
  }
  if (paidAmount >= c.rate) {
    const paidIn = mine.find((p) => inRange(p.paidOn, period.start, period.end));
    return { ...base, state: 'paid', daysLate: 0, label: `Paid ${fmtShort(paidIn!.paidOn)}` };
  }
  const daysLate = diffDays(today, period.due);
  const partial = paidAmount > 0 ? ` · $${base.owed} left` : '';
  if (daysLate < 0) return { ...base, state: 'upcoming', daysLate: 0, label: `Due ${WEEKDAYS_SHORT[weekday(period.due)]}${partial}` };
  if (daysLate === 0) return { ...base, state: 'due', daysLate: 0, label: `Due today${partial}` };
  return { ...base, state: 'late', daysLate, label: `${daysLate} day${daysLate === 1 ? '' : 's'} late${partial}` };
}

/** Clients who should show up in "not logged" alerts. */
export function needsAttention(s: PayStatus): boolean {
  return s.state === 'due' || s.state === 'late';
}

export function sumPayments(payments: Payment[], from: string, to: string): number {
  return payments.filter((p) => inRange(p.paidOn, from, to)).reduce((t, p) => t + p.amount, 0);
}

export interface ReportRange {
  key: 'week' | 'biweek' | 'month' | 'year';
  label: string;
  from: string;
  to: string;
}

export function reportRanges(today: string): ReportRange[] {
  const week = startOfWeek(today);
  return [
    { key: 'week', label: 'This week', from: week, to: addDays(week, 6) },
    { key: 'biweek', label: '2 weeks', from: addDays(week, -7), to: addDays(week, 6) },
    { key: 'month', label: 'Month', from: startOfMonth(today), to: endOfMonth(today) },
    { key: 'year', label: 'Year', from: today.slice(0, 4) + '-01-01', to: today.slice(0, 4) + '-12-31' },
  ];
}

export { addMonths };
