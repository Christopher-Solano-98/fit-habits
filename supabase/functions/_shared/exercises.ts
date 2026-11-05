import type { Exercise, ExerciseKind, ExerciseLog, Measurement } from './types.ts';
import { fmtWith, isMetric, metric, series, type Point, type TrackDef } from './metrics.ts';

export const EXERCISE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Calisthenics', 'Cardio'] as const;

export const KINDS: Record<ExerciseKind, { label: string; hint: string; unit: string; better: 'up' | 'down'; time?: boolean }> = {
  weight: { label: 'Weight & reps', hint: 'Best weight lifted', unit: 'lb', better: 'up' },
  reps: { label: 'Reps', hint: 'Most reps', unit: 'reps', better: 'up' },
  hold: { label: 'Hold time', hint: 'Longest hold (m:ss)', unit: '', better: 'up', time: true },
  time: { label: 'Time (faster is better)', hint: 'Fastest time (m:ss)', unit: '', better: 'down', time: true },
};

const b = (id: string, name: string, group: (typeof EXERCISE_GROUPS)[number], kind: ExerciseKind): Exercise =>
  ({ id: `b-${id}`, name, group, kind, createdAt: '' });

/** Built-in library. Trainers add their own on top (stored in the `exercises` table). */
export const BUILT_IN_EXERCISES: Exercise[] = [
  b('bench', 'Bench press', 'Chest', 'weight'),
  b('incline-bench', 'Incline bench press', 'Chest', 'weight'),
  b('db-bench', 'Dumbbell bench press', 'Chest', 'weight'),
  b('chest-fly', 'Chest fly', 'Chest', 'weight'),
  b('deadlift', 'Deadlift', 'Back', 'weight'),
  b('barbell-row', 'Barbell row', 'Back', 'weight'),
  b('db-row', 'Dumbbell row', 'Back', 'weight'),
  b('lat-pulldown', 'Lat pulldown', 'Back', 'weight'),
  b('cable-row', 'Seated cable row', 'Back', 'weight'),
  b('ohp', 'Overhead press', 'Shoulders', 'weight'),
  b('db-shoulder-press', 'Dumbbell shoulder press', 'Shoulders', 'weight'),
  b('lateral-raise', 'Lateral raise', 'Shoulders', 'weight'),
  b('face-pull', 'Face pull', 'Shoulders', 'weight'),
  b('barbell-curl', 'Barbell curl', 'Arms', 'weight'),
  b('db-curl', 'Dumbbell curl', 'Arms', 'weight'),
  b('hammer-curl', 'Hammer curl', 'Arms', 'weight'),
  b('tricep-pushdown', 'Tricep pushdown', 'Arms', 'weight'),
  b('skull-crusher', 'Skull crusher', 'Arms', 'weight'),
  b('back-squat', 'Back squat', 'Legs', 'weight'),
  b('front-squat', 'Front squat', 'Legs', 'weight'),
  b('leg-press', 'Leg press', 'Legs', 'weight'),
  b('lunge', 'Walking lunge', 'Legs', 'weight'),
  b('leg-extension', 'Leg extension', 'Legs', 'weight'),
  b('hamstring-curl', 'Hamstring curl', 'Legs', 'weight'),
  b('calf-raise', 'Calf raise', 'Legs', 'weight'),
  b('hip-thrust', 'Hip thrust', 'Glutes', 'weight'),
  b('rdl', 'Romanian deadlift', 'Glutes', 'weight'),
  b('glute-bridge', 'Glute bridge', 'Glutes', 'reps'),
  b('step-up', 'Step-up', 'Glutes', 'weight'),
  b('plank', 'Plank', 'Core', 'hold'),
  b('side-plank', 'Side plank', 'Core', 'hold'),
  b('hanging-knee-raise', 'Hanging knee raise', 'Core', 'reps'),
  b('sit-ups', 'Sit-ups (1 min)', 'Core', 'reps'),
  b('russian-twist', 'Russian twist', 'Core', 'reps'),
  b('pushups', 'Push-ups', 'Calisthenics', 'reps'),
  b('pullups', 'Pull-ups', 'Calisthenics', 'reps'),
  b('chinups', 'Chin-ups', 'Calisthenics', 'reps'),
  b('dips', 'Dips', 'Calisthenics', 'reps'),
  b('bw-squats', 'Bodyweight squats', 'Calisthenics', 'reps'),
  b('burpees', 'Burpees', 'Calisthenics', 'reps'),
  b('muscle-ups', 'Muscle-ups', 'Calisthenics', 'reps'),
  b('pistol-squat', 'Pistol squats', 'Calisthenics', 'reps'),
  b('wall-sit', 'Wall sit', 'Calisthenics', 'hold'),
  b('dead-hang', 'Dead hang', 'Calisthenics', 'hold'),
  b('l-sit', 'L-sit', 'Calisthenics', 'hold'),
  b('handstand', 'Handstand hold', 'Calisthenics', 'hold'),
  b('mile', 'Mile run', 'Cardio', 'time'),
  b('400m', '400 m run', 'Cardio', 'time'),
  b('5k', '5K run', 'Cardio', 'time'),
  b('row-500', '500 m row', 'Cardio', 'time'),
  b('jump-rope', 'Jump rope (1 min)', 'Cardio', 'reps'),
];

export function allExercises(custom: Exercise[]): Exercise[] {
  return [...BUILT_IN_EXERCISES, ...custom];
}

export function findExercise(id: string, custom: Exercise[]): Exercise | undefined {
  return BUILT_IN_EXERCISES.find((e) => e.id === id) ?? custom.find((e) => e.id === id);
}

/** Goals and charts key exercises as "ex:<id>" next to body metrics like "bodyFat". */
export const exKey = (id: string) => `ex:${id}`;

export function exerciseDef(e: Exercise): TrackDef {
  const k = KINDS[e.kind];
  return { key: exKey(e.id), label: e.name, unit: k.unit, better: k.better, time: k.time };
}

export function trackDef(key: string, custom: Exercise[]): TrackDef | null {
  if (key.startsWith('ex:')) {
    const e = findExercise(key.slice(3), custom);
    return e ? exerciseDef(e) : null;
  }
  return isMetric(key) ? metric(key) : null;
}

export function exerciseSeries(logs: ExerciseLog[], clientId: string, exerciseId: string): Point[] {
  return logs
    .filter((l) => l.clientId === clientId && l.exerciseId === exerciseId)
    .map((l) => ({ date: l.date, value: l.value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function trackSeries(key: string, clientId: string, measurements: Measurement[], logs: ExerciseLog[]): Point[] {
  if (key.startsWith('ex:')) return exerciseSeries(logs, clientId, key.slice(3));
  return isMetric(key) ? series(measurements, clientId, key) : [];
}

/** "185 lb × 5", "42 reps", "1:30" */
export function fmtLog(e: Exercise, l: Pick<ExerciseLog, 'value' | 'reps'>): string {
  const base = fmtWith(exerciseDef(e), l.value);
  return e.kind === 'weight' && l.reps ? `${base} × ${l.reps}` : base;
}

/** Exercises this client has logged at least once, most recently logged first. */
export function trackedExercises(logs: ExerciseLog[], clientId: string, custom: Exercise[]): Exercise[] {
  const last = new Map<string, string>();
  for (const l of logs) if (l.clientId === clientId && (last.get(l.exerciseId) ?? '') < l.date) last.set(l.exerciseId, l.date);
  return [...last.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .map(([id]) => findExercise(id, custom))
    .filter((e): e is Exercise => !!e);
}
