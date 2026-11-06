import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { createGas } = createRequire(import.meta.url)('./gas-mock.cjs');

function setup(now?: () => Date) {
  const g = createGas({ now });
  g.ctx.setup();
  const key = g.props.APP_KEY as string;
  const call = (action: string, extra: Record<string, unknown> = {}) => g.post({ action, key, ...extra });
  return { ...g, key, call };
}

const client = (p: Record<string, unknown> = {}) => ({
  id: 'c1', firstName: 'Marcus', lastName: 'Reed', birthDate: '1992-03-14', gender: 'Male', phone: '(555) 201-4410', email: 'marcus@example.com',
  address: null, sessionDays: [1, 3, 5], sessionTime: '6:00 AM', rate: 150, cycle: 'weekly', dueWeekday: 1, dueDayOfMonth: 1, channel: 'both',
  medicalCurrent: null, medicalPast: null, emergencyName: null, emergencyPhone: null, notes: null, startDate: '2026-01-05', active: true, createdAt: '2026-01-05T00:00:00Z', ...p,
});

describe('Apps Script backend', () => {
  it('sets up tabs, a private folder, a key and one hourly trigger', () => {
    const g = setup();
    g.ctx.setup(); // running twice must not duplicate the trigger
    expect(g.sheets.map((s: { name: string }) => s.name)).toEqual(expect.arrayContaining(['clients', 'payments', 'settings', 'notices']));
    expect(g.sheets.some((s: { name: string }) => s.name === 'Sheet1')).toBe(false);
    expect(g.key).toMatch(/^[a-f0-9]{64}$/);
    expect(g.ctx.ScriptApp.triggers).toHaveLength(1);
    const code = g.ctx.connectionCode();
    expect(JSON.parse(Buffer.from(code, 'base64').toString())).toEqual({ api: 'https://script.google.com/macros/s/TEST/exec', key: g.key });
  });

  it('rejects requests without the key', () => {
    const g = setup();
    expect(g.post({ action: 'load' }).error).toMatch(/Not connected/);
    expect(g.post({ action: 'load', key: 'wrong' }).error).toMatch(/Not connected/);
  });

  it('round-trips records with the right types, and updates in place', () => {
    const g = setup();
    expect(g.call('load').result.settings).toBeNull();
    g.call('saveSettings', { settings: { id: 'settings', businessName: 'Fit Habits', motivation: { enabled: true, weekday: 5 } } });
    g.call('put', { table: 'clients', row: client() });
    g.call('put', { table: 'clients', row: client({ phone: '5552014410', active: false }) });
    g.call('put', { table: 'payments', row: { id: 'p1', clientId: 'c1', amount: 150, paidOn: '2026-11-02', note: null, receiptVia: 'text', createdAt: 'x' } });
    g.call('put', { table: 'measurements', row: { id: 'm1', clientId: 'c1', takenOn: '2026-11-01', values: { weight: 191, mile: 462 }, note: null, fileId: null, createdAt: 'x' } });
    const r = g.call('load').result;
    expect(r.clients).toHaveLength(1);
    expect(r.clients[0]).toMatchObject({ phone: '5552014410', active: false, rate: 150, sessionDays: [1, 3, 5], address: null, birthDate: '1992-03-14' });
    expect(r.payments[0].amount).toBe(150);
    expect(r.measurements[0].values).toEqual({ weight: 191, mile: 462 });
    expect(r.settings).toMatchObject({ businessName: 'Fit Habits', motivation: { enabled: true, weekday: 5 } });
  });

  it('refuses unknown tables', () => {
    const g = setup();
    expect(g.call('put', { table: 'settings', row: { id: 'x' } }).error).toMatch(/Unknown table/);
  });

  it('stores files in Drive and deleting a client removes everything of theirs', () => {
    const g = setup();
    g.call('put', { table: 'clients', row: client() });
    g.call('put', { table: 'clients', row: client({ id: 'c2', firstName: 'Tasha' }) });
    g.call('put', { table: 'payments', row: { id: 'p1', clientId: 'c1', amount: 150, paidOn: '2026-11-02', note: null, receiptVia: 'text', createdAt: 'x' } });
    g.call('put', { table: 'payments', row: { id: 'p2', clientId: 'c2', amount: 150, paidOn: '2026-11-02', note: null, receiptVia: 'text', createdAt: 'x' } });
    const up = g.call('upload', { clientId: 'c1', kind: 'id', name: 'id.jpg', mime: 'image/jpeg', data: Buffer.from('hello').toString('base64') }).result;
    expect(Buffer.from(g.call('file', { id: up.id }).result.data, 'base64').toString()).toBe('hello');
    expect(g.call('upload', { clientId: 'nope', kind: 'id', name: 'x', mime: 'image/jpeg', data: 'aGk=' }).error).toMatch(/Unknown client/);
    g.call('remove', { table: 'clients', id: 'c1' });
    const r = g.call('load').result;
    expect(r.clients.map((c: { id: string }) => c.id)).toEqual(['c2']);
    expect(r.payments.map((p: { id: string }) => p.id)).toEqual(['p2']);
    expect(r.files).toHaveLength(0);
    expect(g.files[up.path].trashed).toBe(true);
  });

  it('emails receipts; texts only when Twilio is configured', () => {
    const g = setup();
    g.call('saveSettings', { settings: { businessName: 'Fit Habits', email: 'coach@example.com', timezone: 'America/New_York' } });
    g.call('put', { table: 'clients', row: client({ channel: 'text' }) });
    expect(g.call('notify', { clientId: 'c1', channel: 'text', body: 'Got it' }).result).toEqual({ text: false, email: false });
    expect(g.call('notify', { clientId: 'c1', channel: 'both', subject: 'Receipt', body: 'Got it' }).result).toEqual({ text: false, email: true });
    expect(g.mail[0]).toMatchObject({ to: 'marcus@example.com', subject: 'Receipt', replyTo: 'coach@example.com' });
    g.props.TWILIO_ACCOUNT_SID = 'AC1'; g.props.TWILIO_AUTH_TOKEN = 't'; g.props.TWILIO_FROM = '+15550000000';
    expect(g.call('notify', { clientId: 'c1', channel: 'text', body: 'Got it' }).result).toEqual({ text: true, email: false });
    expect(g.fetches[0].opts.payload).toMatchObject({ To: '+15552014410', Body: 'Got it' });
  });

  it('intake: works without the key, checks the token, saves answers once', () => {
    const g = setup();
    g.call('saveSettings', { settings: { businessName: 'Fit Habits' } });
    g.call('put', { table: 'clients', row: client() });
    const token = 'b'.repeat(32);
    g.call('put', { table: 'intakes', row: { id: 'i1', clientId: 'c1', token, createdAt: new Date().toISOString(), completedAt: null, answers: null } });
    expect(g.post({ action: 'intakeInfo', token: 'c'.repeat(32) }).error).toMatch(/not valid/);
    expect(g.post({ action: 'intakeInfo', token }).result).toEqual({ firstName: 'Marcus', business: 'Fit Habits', completed: false, waiverText: expect.stringMatching(/physical training/), trainer: '' });
    const answers = { parq: [false, false, false, false, true, false, false], medicalCurrent: 'Inhaler', medicalPast: '', emergencyName: 'Ana', emergencyPhone: '555', signature: 'Marcus Reed' };
    expect(g.post({ action: 'intakeSubmit', token, answers: { ...answers, parq: [false] } }).error).toMatch(/every question/);
    expect(g.post({ action: 'intakeSubmit', token, answers, id: { mime: 'image/jpeg', data: 'aGk=' } }).result).toBe(true);
    expect(g.post({ action: 'intakeSubmit', token, answers }).error).toMatch(/Already/);
    const r = g.call('load').result;
    expect(r.intakes[0].answers.parq[4]).toBe(true);
    expect(r.clients[0]).toMatchObject({ medicalCurrent: 'Inhaler', emergencyName: 'Ana' });
    expect(r.files.map((f: { kind: string }) => f.kind).sort()).toEqual(['id', 'waiver']);
    const waiver = r.files.find((f: { kind: string }) => f.kind === 'waiver');
    expect(waiver.name).toMatch(/^Signed waiver - Marcus Reed - \d{4}-\d{2}-\d{2}\.html$/);
    const html = Buffer.from(g.call('file', { id: waiver.id }).result.data, 'base64').toString();
    expect(html).toContain('Marcus Reed');
    expect(html).toContain('physical training involves risk');
    expect(r.intakes[0].answers.waiverText).toMatch(/physical training/);
  });

  it('hourly: Friday motivation once, missed-payment email, Friday report', () => {
    let now = new Date('2026-11-06T12:00:00Z'); // Fri 7:00 AM New York
    const g = setup(() => now);
    g.call('saveSettings', { settings: { businessName: 'Fit Habits', trainerName: 'Coach', email: 'coach@example.com', timezone: 'America/New_York', motivation: { enabled: true, weekday: 5, time: '07:00', channel: 'both' }, alerts: { missedPayments: true, graceDays: 2, emailTime: '18:00' }, reports: { weekly: true, biweekly: false, monthly: true }, scanReminderMonths: 4 } });
    g.call('put', { table: 'clients', row: client() });
    g.call('put', { table: 'motivations', row: { id: 'm1', body: 'Keep going', sentOn: null, createdAt: 'x' } });
    g.ctx.hourly();
    g.ctx.hourly(); // same hour again: no repeat
    expect(g.mail.filter((m: { body: string }) => m.body.includes('Keep going'))).toHaveLength(1);
    expect(g.call('load').result.motivations[0].sentOn).toBe('2026-11-06');

    now = new Date('2026-11-06T23:00:00Z'); // Fri 6:00 PM New York: alert + weekly report
    g.ctx.hourly();
    const subjects = g.mail.map((m: { subject: string }) => m.subject);
    expect(subjects).toContain('1 payment not logged');
    expect(subjects).toContain('Who paid this week');
    const report = g.mail.find((m: { subject: string }) => m.subject === 'Who paid this week').body;
    expect(report).toContain('NO PAYMENT LOGGED\n  Marcus Reed');
  });
});

describe('sending account', () => {
  it('records the setup account and refuses to email from any other', () => {
    const g = setup();
    expect(g.props.SENDER_EMAIL).toBe('fit.habits96@gmail.com');
    g.call('saveSettings', { settings: { businessName: 'Fit Habits', email: 'fit.habits96@gmail.com' } });
    g.call('put', { table: 'clients', row: client({ channel: 'email' }) });
    expect(g.call('notify', { clientId: 'c1', channel: 'email', body: 'Receipt' }).result).toEqual({ text: false, email: true });
    g.ctx.__user = 'someone.else@gmail.com';
    expect(g.call('notify', { clientId: 'c1', channel: 'email', body: 'Receipt' }).result).toEqual({ text: false, email: false });
    expect(g.mail).toHaveLength(1);
    expect(g.call('status').result).toMatchObject({ expectedSender: 'fit.habits96@gmail.com', senderProblem: expect.stringMatching(/must come from fit.habits96@gmail.com/) });
  });

  it('checkSetup lists what is done and what is missing', () => {
    const g = setup();
    let report = g.ctx.checkSetup();
    expect(report).toContain('✅ Emails send from fit.habits96@gmail.com');
    expect(report).toContain('✅ All data tabs present');
    expect(report).toContain('✅ Hourly timer on');
    expect(report).toContain('❌ No email in the app yet');
    g.call('saveSettings', { settings: { email: 'fit.habits96@gmail.com' } });
    report = g.ctx.checkSetup();
    expect(report).toContain('✅ Reports and alerts go to fit.habits96@gmail.com');
    expect(g.call('status').result).toMatchObject({ sender: 'fit.habits96@gmail.com', senderProblem: null, emailsLeftToday: 100 });
  });
});
