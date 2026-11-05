import type { Motivation, Settings, Template } from '@shared/types.ts';
import { nowIso, uid } from './repo';

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    trainerName: 'Tony',
    businessName: 'Fit Habits',
    email: '',
    phone: '',
    motivation: { enabled: true, weekday: 5, time: '07:00', channel: 'both' },
    alerts: { missedPayments: true, graceDays: 2, emailTime: '18:00' },
    reports: { weekly: true, biweekly: true, monthly: true },
    scanReminderMonths: 4,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  };
}

export function defaultTemplates(): Template[] {
  return [
    { title: 'Payment reminder', body: 'Hey {first}, quick reminder: your {rate} for this week is still open. Cash at our next session works. - {trainer}' },
    { title: 'Running late', body: 'Hey {first}, running about 10 minutes behind. See you shortly!' },
    { title: 'Confirm next session', body: 'Hey {first}, confirming our next session ({schedule}). Let’s get after it!' },
    { title: 'Great work today', body: 'Great work today, {first}. You don’t look like your parents, you look like your habits. See you next time!' },
    { title: 'Reschedule', body: 'Hey {first}, something came up on my end. Can we move our session? Let me know what works for you.' },
  ].map((t, i) => ({ id: uid(), sort: i, ...t }));
}

export function defaultMotivations(): Motivation[] {
  return [
    'You don’t look like your parents. You look like your habits. One more good choice this weekend.',
    'Motivation gets you started. Habits keep you going. Show up for yourself today.',
    'Eat like you love yourself. Move like you love yourself. Rest like you love yourself.',
    'Small steps every day beat big promises on Monday.',
    'Fill half your plate with plants this weekend. Your body will thank you on Monday.',
    'Progress, not perfection. You’re further along than you were last Friday.',
    'Drink your water, get your steps, get your sleep. Simple wins stack up.',
    'The hardest rep is walking in the door. You already know how to do that.',
  ].map((body) => ({ id: uid(), body, sentOn: null, createdAt: nowIso() }));
}
