import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { applyIntake, buildResponses, intakeFlags, intakeRows, normalizeAnswers } from '../supabase/functions/_shared/intakeForm.ts';
import { signedWaiverHtml } from '../supabase/functions/_shared/waiver.ts';

const { createGas } = createRequire(import.meta.url)('./gas-mock.cjs');

const filled = {
  conditions: { answer: 'Yes', detail: 'Asthma' },
  medications: { answer: 'No', detail: 'ignored when No' },
  injuries: { answer: 'Yes', detail: 'Left knee, ACL 2019' },
  surgeries: { answer: 'No' },
  activity: { answer: 'Light activity (walking, light household chores)' },
  pain: { answer: 'No' },
  pregnant: { answer: 'No' },
  goals: { answer: 'Lose 20 lbs and get stronger' },
};

describe('Fit Habits PAR-Q', () => {
  it('needs every question answered', () => {
    expect(() => buildResponses({ ...filled, surgeries: {} })).toThrow(/every health question/);
    expect(() => buildResponses({ ...filled, activity: { answer: 'Couch' } })).toThrow(/activity level/);
    expect(() => buildResponses({ ...filled, goals: { answer: ' ' } })).toThrow(/fitness goals/);
  });

  it('keeps the question text, flags each Yes and drops details on No', () => {
    const rs = buildResponses(filled);
    expect(rs).toHaveLength(8);
    expect(rs[0]).toEqual({ id: 'conditions', q: expect.stringMatching(/medical conditions/), answer: 'Yes', detail: 'Asthma', flag: true });
    expect(rs[1]).toEqual({ id: 'medications', q: expect.any(String), answer: 'No', flag: false });
    const a = normalizeAnswers({ responses: filled, profile: { birthDate: '1992-03-14', gender: 'Male', phone: '5552014410', address: '1 Main St' }, emergencyName: 'Ana', emergencyPhone: '555', signature: 'Marcus Reed' }, { business: 'Fit Habits', waiverText: 'W', now: '2026-11-22T12:00:00Z' });
    expect(intakeFlags(a).map((r) => r.id)).toEqual(['conditions', 'injuries']);
    expect(a.medicalCurrent).toBe('Medical conditions: Asthma; Injuries/limitations: Left knee, ACL 2019');
    expect(a.consent?.[0]).toMatch(/exercise program with Fit Habits/);
    const html = signedWaiverHtml({ business: 'Fit Habits', clientName: 'Marcus Reed', waiverText: 'W', answers: a });
    expect(html).toContain('Fit Habits PAR-Q');
    expect(html).toContain('Left knee, ACL 2019');
    expect(html).toContain('Lose 20 lbs and get stronger');
    expect(html).toContain('listen to my body');
  });

  it('fills blanks on the profile without overwriting what Tony entered', () => {
    const a = normalizeAnswers({ responses: filled, profile: { birthDate: '1992-03-14', gender: 'Male', phone: '5550000000', address: '1 Main St' }, signature: 'M' }, { business: 'Fit Habits', waiverText: 'W', now: 'x' });
    const c = applyIntake({ birthDate: null, gender: null, phone: '5552014410', address: null, medicalCurrent: null, medicalPast: null, emergencyName: null, emergencyPhone: null, notes: 'Prefers mornings' }, a);
    expect(c).toMatchObject({ birthDate: '1992-03-14', gender: 'Male', phone: '5552014410', address: '1 Main St', notes: 'Goals (from intake): Lose 20 lbs and get stronger\nPrefers mornings' });
  });

  it('still reads forms filled out on the old PAR-Q+', () => {
    const rows = intakeRows({ parq: [false, true, false, false, false, false, false], medicalCurrent: '', medicalPast: '', emergencyName: '', emergencyPhone: '', signature: 'x', signedAt: 'x' });
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.flag)).toHaveLength(1);
  });

  it('the Google script saves it and updates the client', () => {
    const g = createGas();
    g.ctx.setup();
    const call = (action: string, extra: Record<string, unknown> = {}) => g.post({ action, key: g.props.APP_KEY, ...extra });
    call('saveSettings', { settings: { businessName: 'Fit Habits', trainerName: 'Tony' } });
    call('put', { table: 'clients', row: { id: 'c1', firstName: 'Marcus', lastName: 'Reed', sessionDays: [], active: true, channel: 'text', rate: 0, phone: null, address: null, birthDate: null, gender: null, notes: null } });
    const token = 'e'.repeat(32);
    call('put', { table: 'intakes', row: { id: 'i1', clientId: 'c1', token, createdAt: new Date().toISOString(), completedAt: null, answers: null } });
    const answers = { responses: filled, profile: { birthDate: '1992-03-14', gender: 'Male', phone: '5552014410', address: '1 Main St' }, emergencyName: 'Ana', emergencyPhone: '555', signature: 'Marcus Reed' };
    expect(g.post({ action: 'intakeSubmit', token, answers: { ...answers, responses: { ...filled, pain: {} } } }).error).toMatch(/every health question/);
    expect(g.post({ action: 'intakeSubmit', token, answers }).result).toBe(true);
    const r = call('load').result;
    expect(r.intakes[0].answers.responses).toHaveLength(8);
    expect(r.clients[0]).toMatchObject({ phone: '5552014410', address: '1 Main St', birthDate: '1992-03-14', gender: 'Male', emergencyName: 'Ana', medicalCurrent: expect.stringMatching(/Asthma/), notes: expect.stringMatching(/Lose 20 lbs/) });
  });
});
