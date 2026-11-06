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
    const to = g.mail.filter((e: { subject: string; body: string }) => !e.subject.startsWith('Sent:') && e.body.includes('Show up today')).map((e: { to: string }) => e.to);
    expect(to).toEqual(['m@example.com']);
  });
});

describe('day-before motivation preview', () => {
  const setupGas = (now: Date, preview?: object) => {
    const g = createGas({ now: () => now });
    g.ctx.setup();
    const call = (action: string, extra: Record<string, unknown> = {}) => g.post({ action, key: g.props.APP_KEY, ...extra });
    call('saveSettings', { settings: { businessName: 'Fit Habits', trainerName: 'Tony', email: 'fit.habits96@gmail.com', timezone: 'America/New_York', motivation: m({ excluded: ['c3'], ...(preview ? { preview } : {}) }), alerts: {}, reports: {} } });
    call('put', { table: 'clients', row: client() });
    call('put', { table: 'clients', row: client({ id: 'c2', firstName: 'Tasha', email: null, phone: null }) });
    call('put', { table: 'clients', row: client({ id: 'c3', firstName: 'Devon' }) });
    call('put', { table: 'motivations', row: { id: 'x', body: 'One more good choice this weekend', sentOn: null, createdAt: 'x' } });
    return { g, call };
  };

  it('emails Tony the message and who gets it on Thursday at 7 AM, once', () => {
    const { g } = setupGas(new Date('2026-11-05T12:00:00Z'), { enabled: true, email: 'anthonychesleyjr@gmail.com', time: '07:00' }); // Thu 7 AM NY
    g.ctx.hourly();
    g.ctx.hourly();
    const previews = g.mail.filter((e: { subject: string }) => e.subject.startsWith('Preview'));
    expect(previews).toHaveLength(1);
    expect(previews[0].to).toBe('anthonychesleyjr@gmail.com');
    expect(previews[0].body).toContain('"One more good choice this weekend"');
    expect(previews[0].body).toContain('tomorrow (Friday) at 7:00 AM by text and email');
    expect(previews[0].body).toContain('Going to 1 client: Marcus Reed');
    expect(previews[0].body).toMatch(/Not getting it: .*Tasha \(no phone number on file\).*Devon \(taken off the list\)/);
    // the preview doesn't count as sending the motivation itself
    expect(g.mail.filter((e: { body: string }) => e.body.includes('Hey Marcus'))).toHaveLength(0);
  });

  it('is on by default for sheets set up earlier, going to the report email', () => {
    const { g } = setupGas(new Date('2026-11-05T12:00:00Z'));
    g.ctx.hourly();
    expect(g.mail.find((e: { subject: string }) => e.subject.startsWith('Preview'))?.to).toBe('fit.habits96@gmail.com');
  });

  it('can be turned off, and "send now" works any day', () => {
    const { g, call } = setupGas(new Date('2026-11-05T12:00:00Z'), { enabled: false, email: 'anthonychesleyjr@gmail.com', time: '07:00' });
    g.ctx.hourly();
    expect(g.mail.filter((e: { subject: string }) => e.subject.startsWith('Preview'))).toHaveLength(0);
    expect(call('motivationPreview').result).toEqual({ sent: true, to: 'anthonychesleyjr@gmail.com' });
  });

  it('says who will not get it because automatic texts are not set up', () => {
    const { g, call } = setupGas(new Date('2026-11-05T12:00:00Z'), { enabled: true, email: 'anthonychesleyjr@gmail.com', time: '07:00' });
    call('put', { table: 'clients', row: client({ id: 'c4', firstName: 'Jay', lastName: 'Kim', channel: 'text', email: null }) });
    g.ctx.hourly();
    const body = g.mail.find((e: { subject: string }) => e.subject.startsWith('Preview')).body;
    expect(body).toContain('Going to 1 client: Marcus Reed');
    expect(body).toMatch(/Jay \(only takes texts, and automatic texts aren't set up yet, so text them yourself\)/);
  });
});

describe('after the Friday motivation sends', () => {
  it('emails Tony who got it and the app can show the same list', () => {
    const g = createGas({ now: () => new Date('2026-11-06T12:00:00Z') }); // Fri 7 AM NY
    g.ctx.setup();
    const call = (action: string, extra: Record<string, unknown> = {}) => g.post({ action, key: g.props.APP_KEY, ...extra });
    call('saveSettings', { settings: { businessName: 'Fit Habits', trainerName: 'Tony', email: 'fit.habits96@gmail.com', timezone: 'America/New_York', motivation: m({ excluded: ['c3'], preview: { enabled: true, email: 'anthonychesleyjr@gmail.com', time: '07:00' } }), alerts: {}, reports: {} } });
    call('put', { table: 'clients', row: client() });
    call('put', { table: 'clients', row: client({ id: 'c2', firstName: 'Jay', lastName: 'Kim', channel: 'text', email: null }) });
    call('put', { table: 'clients', row: client({ id: 'c3', firstName: 'Devon' }) });
    call('put', { table: 'motivations', row: { id: 'x', body: 'Show up today', sentOn: null, createdAt: 'x' } });
    expect(call('motivationStatus').result).toBeNull();
    g.ctx.hourly();
    g.ctx.hourly();
    const sent = g.mail.filter((e: { subject: string }) => e.subject.startsWith('Sent:'));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('anthonychesleyjr@gmail.com');
    expect(sent[0].subject).toBe("Sent: this week's motivation went to 1 client");
    expect(sent[0].body).toContain('Marcus Reed (email)');
    expect(sent[0].body).toContain('Jay Kim (only takes texts');
    expect(sent[0].body).toContain('Devon Reed (taken off the list)');
    const st = call('motivationStatus').result;
    expect(st).toMatchObject({ date: '2026-11-06', message: 'Show up today', got: [{ id: 'c1', how: 'email' }], failed: [] });
    expect(st.missed).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'c2', textYourself: true }), expect.objectContaining({ id: 'c3', reason: 'Taken off the list' })]));
  });
});

