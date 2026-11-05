import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../supabase/functions/_shared/types.ts';
import { migrateSnapshot } from '../src/data/migrate';
import { sampleSnapshot } from '../src/data/samples';

describe('moving old preset exercises into exercise logs', () => {
  it('converts legacy measurement values and goals, keeps body values', () => {
    const s = {
      clients: [], payments: [], files: [], templates: [], motivations: [], intakes: [],
      measurements: [
        { id: 'm1', clientId: 'c', takenOn: '2026-10-01', values: { weight: 190, mile: 462, bench: 185 }, note: null, fileId: null, createdAt: 'x' },
        { id: 'm2', clientId: 'c', takenOn: '2026-09-01', values: { pushups: 40 }, note: null, fileId: null, createdAt: 'x' },
      ],
      goals: [{ id: 'g', clientId: 'c', metric: 'mile', target: 420, byDate: null, createdAt: 'x' }],
    } as unknown as Snapshot;
    expect(migrateSnapshot(s)).toBe(true);
    expect(s.measurements).toEqual([expect.objectContaining({ id: 'm1', values: { weight: 190 } })]);
    expect(s.exerciseLogs.map((l) => [l.exerciseId, l.value, l.date])).toEqual([
      ['b-mile', 462, '2026-10-01'], ['b-bench', 185, '2026-10-01'], ['b-pushups', 40, '2026-09-01'],
    ]);
    expect(s.goals[0].metric).toBe('ex:b-mile');
    expect(migrateSnapshot(s)).toBe(false); // second run changes nothing
  });

  it('sample data has no preset exercises left in body measurements', () => {
    const s = sampleSnapshot();
    const keys = new Set(s.measurements.flatMap((m) => Object.keys(m.values)));
    for (const old of ['pushups', 'plank', 'mile', 'squat', 'bench', 'deadlift']) expect(keys.has(old)).toBe(false);
    expect(s.exerciseLogs.length).toBeGreaterThan(0);
  });
});
