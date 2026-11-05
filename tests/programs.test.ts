import { describe, expect, it } from 'vitest';
import { DEFAULT_PHASES, howToUrl, phaseWeeksLabel, programPosition, totalWeeks } from '../supabase/functions/_shared/programs.ts';
import { decodePlan, encodePlan, type PlanPayload } from '../src/lib/planLink';
import { itemsForClient, lastLog } from '../src/screens/Workouts';
import type { ExerciseLog } from '../supabase/functions/_shared/types.ts';

const prog = (startDate: string | null) => ({ phases: DEFAULT_PHASES, phaseWeeks: 2, startDate });

describe('8-week programs', () => {
  it('has 4 two-week phases', () => {
    expect(totalWeeks(prog(null))).toBe(8);
    expect([0, 1, 2, 3].map((i) => phaseWeeksLabel({ phaseWeeks: 2 }, i))).toEqual(['Weeks 1–2', 'Weeks 3–4', 'Weeks 5–6', 'Weeks 7–8']);
  });
  it('knows which week and phase a client is in', () => {
    expect(programPosition(prog('2026-11-09'), '2026-11-05')).toMatchObject({ status: 'upcoming' });
    expect(programPosition(prog('2026-11-02'), '2026-11-02')).toMatchObject({ week: 1, phase: 0, status: 'active' });
    expect(programPosition(prog('2026-11-02'), '2026-11-16')).toMatchObject({ week: 3, phase: 1 });
    expect(programPosition(prog('2026-11-02'), '2026-11-30')).toMatchObject({ week: 5, phase: 2 }); // deload
    expect(programPosition(prog('2026-11-02'), '2026-12-27')).toMatchObject({ week: 8, phase: 3 });
    expect(programPosition(prog('2026-11-02'), '2026-12-28')).toMatchObject({ status: 'done' });
  });
  it('uses the trainer’s own video link, else a YouTube search', () => {
    expect(howToUrl({ id: 'b-bench', name: 'Bench press' }, { 'b-bench': 'https://youtu.be/x' })).toBe('https://youtu.be/x');
    expect(howToUrl({ id: 'b-bench', name: 'Bench press' }, {})).toContain('youtube.com/results?search_query=how%20to%20do%20Bench%20press');
  });
  it('round-trips a plan through the link', async () => {
    const p: PlanPayload = { v: 1, b: 'Fit Habits', t: 'Tony', c: 'Jay', n: 'Strength', s: '2026-11-02', w: 2, ph: [{ l: 'Foundation', no: '' }], d: [{ n: 'Day 1', i: [{ e: 'Bench press', u: 'https://youtu.be/x', p: ['3 × 10 @ 95'] }] }] };
    const code = await encodePlan(p);
    expect(code).toMatch(/^[zj][A-Za-z0-9_-]+$/);
    expect(await decodePlan(code)).toEqual(p);
  });
});

describe('per-person workout targets', () => {
  const log = (exerciseId: string, date: string, value: number): ExerciseLog => ({ id: date, clientId: 'c', exerciseId, date, value, reps: 8, note: null, createdAt: '' });
  const logs = [log('b-bench', '2026-10-01', 125), log('b-bench', '2026-10-30', 135), log('b-squat', '2026-10-30', 185)];

  it('finds the client’s latest numbers', () => {
    expect(lastLog(logs, 'c', 'b-bench')?.value).toBe(135);
    expect(lastLog(logs, 'c', 'b-bench', '2026-10-15')?.value).toBe(125);
    expect(lastLog(logs, 'other', 'b-bench')).toBeUndefined();
  });
  it('pre-fills targets from last time, else the workout default', () => {
    const items = itemsForClient([
      { id: '1', exerciseId: 'b-bench', plan: '3 × 8–10', target: 95 },
      { id: '2', exerciseId: 'b-pullups', plan: '3 × max', target: 6 },
      { id: '3', exerciseId: 'b-plank', plan: '3 sets' },
    ], 'c', logs);
    expect(items.map((i) => i.target)).toEqual([135, 6, null]);
    expect(items.every((i) => i.done === false && i.value === null)).toBe(true);
  });
});
