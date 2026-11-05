import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import type { Client, Settings } from '../supabase/functions/_shared/types.ts';
import { motivationReach, motivationRecipients } from '../supabase/functions/_shared/messages.ts';

const { createGas } = createRequire(import.meta.url)('./gas-mock.cjs');

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'Marcus', lastName: 'Reed', birthDate: null, gender: null, phone: '5552014410', email: 'm@example.com', address: null,
  sessionDays: [], sessionTime: null, rate: 150, cycle: 'weekly', dueWeekday: 1, dueDayOfMonth: 1, channel: 'both',
  medicalCurrent: null, medicalPast: null, emergencyName: null, emergencyPhone: null, notes: null,
  startDate: '2026-01-05', active: true, createdAt: '', ...p,
});
const m = (p: Partial<Settings['motivation']> = {}): Settings['motivation'] => ({ enabled: true, weekday: 5, time: '07:00', channel: 'both', ...p });

describe('weekly motivation list', () => {
  it('everyone is on by default; excluded clients drop off', () => {
    const cs = [client(), client({ id: 'c2', firstName: 'Tasha' }), client({ id: 'c3', firstName: 'Devon' })];
    expect(motivationRecipients(cs, m()).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(motivationRecipients(cs, m({ excluded: ['c2'] })).map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('explains who it cannot reach', () => {
    expect(motivationReach(client({ channel: 'none' }), m()).reason).toBe('Opted out of messages');
    expect(motivationReach(client({ phone: null }), m({ channel: 'text' })).reason).toBe('No phone number on file');
    expect(motivationReach(client({ channel: 'email' }), m({ channel: 'text' })).reason).toMatch(/by email; this goes by text/);
    expect(motivationReach(client({ phone: null }), m())).toEqual({ text: false, email: true, reason: null });
  });

  it('the scheduled Apps Script send skips people taken off the list', () => {
    const g = createGas({ now: () => new Date('2026-11-06T12:00:00Z') }); // Fri 7 AM New York
    g.ctx.setup();
    const call = (action: string, extra: Record<string, unknown>) => g.post({ action, key: g.props.APP_KEY, ...extra });
    call('saveSettings', { settings: { businessName: 'Fit Habits', trainerName: 'Tony', email: 'tony@example.com', timezone: 'America/New_York', motivation: m({ excluded: ['c2'] }), alerts: {}, reports: {} } });
    call('put', { table: 'clients', row: client() });
    call('put', { table: 'clients', row: client({ id: 'c2', firstName: 'Tasha', email: 'tasha@example.com' }) });
    call('put', { table: 'motivations', row: { id: 'x', body: 'Show up today', sentOn: null, createdAt: 'x' } });
    g.ctx.hourly();
    const to = g.mail.filter((e: { body: string }) => e.body.includes('Show up today')).map((e: { to: string }) => e.to);
    expect(to).toEqual(['m@example.com']);
  });
});
