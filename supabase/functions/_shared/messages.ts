import type { Channel, Client, Payment, Settings } from './types.ts';
import { fmtLong, WEEKDAYS_SHORT } from './dates.ts';

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

export interface Reach {
  text: boolean;
  email: boolean;
  /** Why this client won't get the weekly motivation, or null if they will. */
  reason: string | null;
}

/** Whether the weekly motivation can reach a client, given both sides' text/email choice. */
export function motivationReach(c: Client, m: Settings['motivation']): Reach {
  const none = (reason: string): Reach => ({ text: false, email: false, reason });
  if (!c.active) return none('Inactive client');
  if (c.channel === 'none') return none('Opted out of messages');
  const sendText = m.channel === 'text' || m.channel === 'both';
  const sendEmail = m.channel === 'email' || m.channel === 'both';
  const takesText = c.channel === 'text' || c.channel === 'both';
  const takesEmail = c.channel === 'email' || c.channel === 'both';
  const text = sendText && takesText && !!c.phone;
  const email = sendEmail && takesEmail && !!c.email;
  if (text || email) return { text, email, reason: null };
  if (!(sendText && takesText) && !(sendEmail && takesEmail)) return none(`Gets messages by ${c.channel}; this goes by ${m.channel}`);
  return none(sendText && takesText ? 'No phone number on file' : 'No email on file');
}

/** Clients who will actually receive the weekly motivation. */
export function motivationRecipients(clients: Client[], m: Settings['motivation']): Client[] {
  const excluded = m.excluded ?? [];
  return clients.filter((c) => !excluded.includes(c.id) && motivationReach(c, m).reason === null);
}

export function receiptText(c: Client, p: Payment, s: Pick<Settings, 'businessName' | 'trainerName'>): string {
  return `${s.businessName}: We received your $${p.amount} cash payment on ${fmtLong(p.paidOn)}. Thank you, ${c.firstName}!`;
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

/** The day-before preview email: tomorrow's message, when, how, and who gets it. */
export function motivationPreviewText(o: { message: string; weekdayName: string; time: string; channel: Channel; to: Client[]; notTo: { client: Client; reason: string }[]; appUrl?: string }): string {
  const how = o.channel === 'both' ? 'text and email' : o.channel;
  const lines = [
    `Here's the Fit Habits motivation going out tomorrow (${o.weekdayName}) at ${o.time} by ${how}:`,
    '',
    `"${o.message}"`,
    '',
    `Going to ${o.to.length} client${o.to.length === 1 ? '' : 's'}: ${o.to.map((c) => `${c.firstName} ${c.lastName ?? ''}`.trim()).join(', ') || 'nobody yet'}`,
  ];
  if (o.notTo.length) lines.push(`Not getting it: ${o.notTo.map((x) => `${x.client.firstName} (${x.reason})`).join(', ')}`);
  lines.push('', 'To change the message or who gets it, open the Fit Habits app → Messages before then.');
  if (o.appUrl) lines.push(o.appUrl);
  return lines.join('\n');
}
