import type { Snapshot } from '@shared/types.ts';
import { uid } from './repo';
import { defaultSettings } from './defaults';

// Early builds stored a few fixed exercises (push-ups, plank, mile, squat,
// bench, deadlift) as body measurements. They're now exercise logs, which
// the trainer picks from a library instead of having them preset.
const LEGACY: Record<string, string> = {
  pushups: 'b-pushups', plank: 'b-plank', mile: 'b-mile', squat: 'b-back-squat', bench: 'b-bench', deadlift: 'b-deadlift',
};

/** Fills in tables added after a snapshot was saved and moves legacy exercise values. Returns true if anything changed. */
export function migrateSnapshot(s: Snapshot): boolean {
  let changed = false;
  if (!s.exercises) { s.exercises = []; changed = true; }
  if (!s.exerciseLogs) { s.exerciseLogs = []; changed = true; }
  if (!s.workouts) { s.workouts = []; changed = true; }
  if (!s.sessions) { s.sessions = []; changed = true; }
  if (!s.programs) { s.programs = []; changed = true; }
  // Settings added in later versions (waiver wording, exercise links…).
  const full = { ...defaultSettings(), ...s.settings };
  if (Object.keys(full).length !== Object.keys(s.settings ?? {}).length) { s.settings = full; changed = true; }
  for (const m of s.measurements) {
    const values = m.values as Record<string, number>;
    for (const [old, exerciseId] of Object.entries(LEGACY)) {
      if (typeof values[old] !== 'number') continue;
      s.exerciseLogs.push({ id: uid(), clientId: m.clientId, exerciseId, date: m.takenOn, value: values[old], reps: null, note: null, createdAt: m.createdAt });
      delete values[old];
      changed = true;
    }
  }
  const before = s.measurements.length;
  s.measurements = s.measurements.filter((m) => Object.keys(m.values).length > 0 || m.fileId);
  if (s.measurements.length !== before) changed = true;
  for (const g of s.goals) {
    if (LEGACY[g.metric]) { g.metric = `ex:${LEGACY[g.metric]}`; changed = true; }
  }
  return changed;
}
