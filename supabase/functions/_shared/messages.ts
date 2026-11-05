import type { Client, Payment, Settings } from './types.ts';
import { fmtShort, WEEKDAYS_SHORT } from './dates.ts';

export function scheduleText(c: Client): string {
  if (!c.sessionDays.length) return 'No set schedule';
  const days = [...c.sessionDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS_SHORT[d]);
  const list = days.length > 1 ? days.slice(0, -1).join(', ') + ' & ' + days[days.length - 1] : days[0];
  return c.sessionTime ? `${list} · ${c.sessionTime}` : list;
}

export function fillTemplate(body: string, c: Client, s: Pick<Settings, 'businessName' | 'trainerName'>, extra: Record<string, string> = {}): string {
  const vars: Record<string, string> = {
    first: c.firstName,
    name: `${c.firstName} ${c.lastName}`.trim(),
    rate: `$${c.rate}`,
    schedule: scheduleText(c),
    business: s.businessName,
    trainer: s.trainerName,
    ...extra,
  };
  return body.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export function receiptText(c: Client, p: Payment, s: Pick<Settings, 'businessName' | 'trainerName'>): string {
  const method = p.method === 'cash' ? 'cash ' : '';
  return `${s.businessName}: Got your $${p.amount} ${method}payment on ${fmtShort(p.paidOn)}. Thank you, ${c.firstName}! You look like your habits.`;
}

export function digits(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? '+1' + d : d ? '+' + d : '';
}

/** Opens the phone's own Messages app with the text filled in. */
export function smsHref(phone: string, body: string): string {
  return `sms:${digits(phone)}?&body=${encodeURIComponent(body)}`;
}

export function telHref(phone: string): string {
  return `tel:${digits(phone)}`;
}

export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
