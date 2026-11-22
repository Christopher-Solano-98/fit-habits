// Tony's own Fit Habits PAR-Q, the health questionnaire on the client intake form.
// Wording follows his "Fit Habits (PARQ)" document. Each answer is saved with the
// question text it was asked with, so later edits here never change old forms.

import type { IntakeAnswers, IntakeResponse } from './types.ts';
import { PARQ_QUESTIONS } from './parq.ts';

export const INTAKE_FORM_ID = 'fit-habits-parq-1';

export type IntakeQuestion =
  | { id: string; section: string; q: string; kind: 'yesno'; detail?: string }
  | { id: string; section: string; q: string; kind: 'choice'; options: string[] }
  | { id: string; section: string; q: string; kind: 'text'; placeholder?: string };

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  { id: 'conditions', section: 'Medical history & current health status', kind: 'yesno', q: 'Do you have any current or past medical conditions? (e.g., heart disease, hypertension, diabetes, asthma, etc.)', detail: 'If yes, please specify' },
  { id: 'medications', section: 'Medical history & current health status', kind: 'yesno', q: 'Are you currently on any medication or supplements?', detail: 'If yes, please specify' },
  { id: 'injuries', section: 'Medical history & current health status', kind: 'yesno', q: 'Do you have any injuries or physical limitations?', detail: 'If yes, please specify' },
  { id: 'surgeries', section: 'Medical history & current health status', kind: 'yesno', q: 'Have you had any surgeries recently?', detail: 'If yes, please specify' },
  { id: 'activity', section: 'Lifestyle & activity level', kind: 'choice', q: 'How would you describe your current activity level?', options: ['Sedentary (little or no exercise)', 'Light activity (walking, light household chores)', 'Moderate activity (regular exercise, sports)', 'Highly active (professional athlete, intense training)'] },
  { id: 'pain', section: 'Lifestyle & activity level', kind: 'yesno', q: 'Do you experience any pain or discomfort during physical activity?', detail: 'If yes, please describe' },
  { id: 'pregnant', section: 'Exercise readiness', kind: 'yesno', q: 'Are you pregnant or trying to become pregnant?' },
  { id: 'goals', section: 'Exercise readiness', kind: 'text', q: 'What are your fitness goals? (e.g., weight loss, strength, endurance)', placeholder: 'Lose 20 lbs, get stronger, run a 5K…' },
];

export const INTAKE_GENDERS = ['Male', 'Female', 'Other'];

export const INTAKE_CONSENT = (business: string) => [
  `I confirm that the information provided is accurate and that I have consulted with a healthcare provider if necessary, before starting this exercise program with ${business}.`,
  'I understand that exercise involves some risks and I agree to listen to my body and stop if I experience discomfort or pain.',
];

export interface IntakeRaw { [id: string]: { answer?: string; detail?: string } }

const clip = (v: unknown, n = 2000) => String(v ?? '').slice(0, n).trim();

/**
 * Checks what the client sent against the form and attaches the question text.
 * Throws with a message the client sees if something is missing.
 */
export function buildResponses(raw: IntakeRaw | IntakeResponse[] | undefined): IntakeResponse[] {
  const byId: IntakeRaw = Array.isArray(raw) ? Object.fromEntries(raw.map((r) => [r.id, r])) : raw ?? {};
  return INTAKE_QUESTIONS.map((q) => {
    const got = byId[q.id] ?? {};
    const answer = clip(got.answer, q.kind === 'text' ? 2000 : 200);
    if (q.kind === 'yesno' && answer !== 'Yes' && answer !== 'No') throw new Error('Please answer every health question.');
    if (q.kind === 'choice' && !q.options.includes(answer)) throw new Error('Please pick your activity level.');
    if (q.kind === 'text' && !answer) throw new Error('Please tell us your fitness goals.');
    const detail = q.kind === 'yesno' && answer === 'Yes' ? clip(got.detail) : '';
    return { id: q.id, q: q.q, answer, ...(detail ? { detail } : {}), flag: q.kind === 'yesno' && answer === 'Yes' };
  });
}

/** One row per question, for old (PAR-Q+) and new (Fit Habits PAR-Q) forms alike. */
export function intakeRows(a: IntakeAnswers): IntakeResponse[] {
  if (a.responses?.length) return a.responses;
  return (a.parq ?? []).map((yes, i) => ({ id: `parq${i}`, q: PARQ_QUESTIONS[i] ?? `Question ${i + 1}`, answer: yes ? 'Yes' : 'No', flag: !!yes }));
}

export function intakeFlags(a: IntakeAnswers): IntakeResponse[] {
  return intakeRows(a).filter((r) => r.flag);
}

/** Health notes for the client's profile, built from their answers. */
export function medicalFromResponses(rs: IntakeResponse[]): { medicalCurrent: string; medicalPast: string } {
  const get = (id: string) => rs.find((r) => r.id === id);
  const line = (id: string, label: string) => {
    const r = get(id);
    return r?.answer === 'Yes' ? `${label}${r.detail ? `: ${r.detail}` : ''}` : '';
  };
  const current = [line('conditions', 'Medical conditions'), line('medications', 'Medication/supplements'), line('injuries', 'Injuries/limitations'), line('pain', 'Pain during activity'), line('pregnant', 'Pregnant or trying to become pregnant')].filter(Boolean);
  return { medicalCurrent: current.join('; '), medicalPast: line('surgeries', 'Recent surgery') };
}

export function goalsFromResponses(rs: IntakeResponse[]): string {
  return rs.find((r) => r.id === 'goals')?.answer ?? '';
}

/**
 * The answers to store, rebuilt from what the browser sent (never trusted as-is).
 * Accepts the Fit Habits PAR-Q and, from app versions still open on a phone, the older PAR-Q+.
 */
export function normalizeAnswers(raw: Record<string, unknown>, o: { business: string; waiverText: string; now: string }): IntakeAnswers {
  const signature = clip(raw.signature, 200);
  const base = {
    emergencyName: clip(raw.emergencyName, 200), emergencyPhone: clip(raw.emergencyPhone, 50),
    signature, signedAt: o.now, waiverText: o.waiverText,
  };
  if (raw.responses) {
    const responses = buildResponses(raw.responses as IntakeRaw | IntakeResponse[]);
    if (!signature) throw new Error('Please type your full name to sign.');
    const p = (raw.profile ?? {}) as Record<string, unknown>;
    const gender = clip(p.gender, 40);
    const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(clip(p.birthDate, 10)) ? clip(p.birthDate, 10) : '';
    const profile = { birthDate, gender: INTAKE_GENDERS.includes(gender) ? gender : '', phone: clip(p.phone, 50), address: clip(p.address, 300) };
    return {
      form: INTAKE_FORM_ID, responses, ...medicalFromResponses(responses), ...base,
      profile: Object.fromEntries(Object.entries(profile).filter(([, v]) => v)),
      consent: INTAKE_CONSENT(o.business),
    };
  }
  const parq = Array.isArray(raw.parq) ? raw.parq.map(Boolean).slice(0, PARQ_QUESTIONS.length) : [];
  if (parq.length !== PARQ_QUESTIONS.length || !signature) throw new Error('Please answer every question and sign.');
  return { parq, medicalCurrent: clip(raw.medicalCurrent), medicalPast: clip(raw.medicalPast), ...base };
}

/** Client profile after their intake: health notes and emergency contact from the form; contact details only fill blanks. */
export function applyIntake<C extends { birthDate: string | null; gender: string | null; phone: string | null; address: string | null; medicalCurrent: string | null; medicalPast: string | null; emergencyName: string | null; emergencyPhone: string | null; notes: string | null }>(c: C, a: IntakeAnswers): C {
  const next = { ...c };
  if (a.medicalCurrent) next.medicalCurrent = a.medicalCurrent;
  if (a.medicalPast) next.medicalPast = a.medicalPast;
  if (a.emergencyName) next.emergencyName = a.emergencyName;
  if (a.emergencyPhone) next.emergencyPhone = a.emergencyPhone;
  const p = a.profile ?? {};
  if (p.birthDate && !next.birthDate) next.birthDate = p.birthDate;
  if (p.gender && !next.gender) next.gender = p.gender;
  if (p.phone && !next.phone) next.phone = p.phone;
  if (p.address && !next.address) next.address = p.address;
  const goals = a.responses ? goalsFromResponses(a.responses) : '';
  if (goals && !(next.notes ?? '').includes(goals)) next.notes = [`Goals (from intake): ${goals}`, next.notes].filter(Boolean).join('\n');
  return next;
}
