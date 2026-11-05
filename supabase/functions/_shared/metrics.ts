import type { Goal, Measurement, MetricKey } from './types.ts';

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  group: 'Body' | 'Measurements' | 'Health' | 'Performance';
  better: 'up' | 'down';
  step: number;
  time?: boolean; // stored as seconds, shown as m:ss
}

export const METRICS: MetricDef[] = [
  { key: 'weight', label: 'Weight', unit: 'lb', group: 'Body', better: 'down', step: 0.1 },
  { key: 'bodyFat', label: 'Body fat', unit: '%', group: 'Body', better: 'down', step: 0.1 },
  { key: 'leanMass', label: 'Lean mass', unit: 'lb', group: 'Body', better: 'up', step: 0.1 },
  { key: 'bmi', label: 'BMI', unit: '', group: 'Body', better: 'down', step: 0.1 },
  { key: 'waist', label: 'Waist', unit: 'in', group: 'Measurements', better: 'down', step: 0.25 },
  { key: 'hips', label: 'Hips', unit: 'in', group: 'Measurements', better: 'down', step: 0.25 },
  { key: 'chest', label: 'Chest', unit: 'in', group: 'Measurements', better: 'up', step: 0.25 },
  { key: 'arm', label: 'Arm', unit: 'in', group: 'Measurements', better: 'up', step: 0.25 },
  { key: 'thigh', label: 'Thigh', unit: 'in', group: 'Measurements', better: 'down', step: 0.25 },
  { key: 'restingHr', label: 'Resting heart rate', unit: 'bpm', group: 'Health', better: 'down', step: 1 },
  { key: 'systolic', label: 'Blood pressure (top)', unit: 'mmHg', group: 'Health', better: 'down', step: 1 },
  { key: 'diastolic', label: 'Blood pressure (bottom)', unit: 'mmHg', group: 'Health', better: 'down', step: 1 },
  { key: 'pushups', label: 'Push-ups (1 min)', unit: 'reps', group: 'Performance', better: 'up', step: 1 },
  { key: 'plank', label: 'Plank hold', unit: '', group: 'Performance', better: 'up', step: 1, time: true },
  { key: 'mile', label: 'Mile time', unit: '', group: 'Performance', better: 'down', step: 1, time: true },
  { key: 'squat', label: 'Squat (best)', unit: 'lb', group: 'Performance', better: 'up', step: 5 },
  { key: 'bench', label: 'Bench press (best)', unit: 'lb', group: 'Performance', better: 'up', step: 5 },
  { key: 'deadlift', label: 'Deadlift (best)', unit: 'lb', group: 'Performance', better: 'up', step: 5 },
];

export const METRIC_GROUPS = ['Body', 'Measurements', 'Health', 'Performance'] as const;

export function metric(key: MetricKey): MetricDef {
  return METRICS.find((m) => m.key === key)!;
}

function round(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function fmtValue(key: MetricKey, v: number): string {
  const m = metric(key);
  if (m.time) {
    const s = Math.round(v);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  return m.unit === '%' ? `${round(v)}%` : m.unit ? `${round(v)} ${m.unit}` : round(v);
}

/** Parses "7:45" or "465" for time metrics, plain numbers otherwise. */
export function parseValue(key: MetricKey, raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (metric(key).time && s.includes(':')) {
    const [m, sec] = s.split(':').map(Number);
    return Number.isFinite(m) && Number.isFinite(sec) ? m * 60 + sec : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface Point {
  date: string;
  value: number;
}

export function series(measurements: Measurement[], clientId: string, key: MetricKey): Point[] {
  return measurements
    .filter((m) => m.clientId === clientId && typeof m.values[key] === 'number')
    .map((m) => ({ date: m.takenOn, value: m.values[key] as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface Change {
  first: Point;
  last: Point;
  delta: number;
  good: boolean;
  text: string; // "Down 10 pts" / "Up 15 lb"
}

export function change(key: MetricKey, pts: Point[]): Change | null {
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const delta = last.value - first.value;
  const m = metric(key);
  const good = delta === 0 ? true : (delta < 0) === (m.better === 'down');
  const size = m.time ? fmtValue(key, Math.abs(delta)) : m.unit === '%' ? `${round(Math.abs(delta))} pts` : `${round(Math.abs(delta))}${m.unit ? ' ' + m.unit : ''}`;
  const text = delta === 0 ? 'No change' : `${delta < 0 ? 'Down' : 'Up'} ${size}`;
  return { first, last, delta, good, text };
}

/** 0–1 progress from the first recorded value toward the goal target. */
export function goalProgress(g: Goal, pts: Point[]): number | null {
  if (!pts.length) return null;
  const start = pts[0].value, now = pts[pts.length - 1].value;
  if (start === g.target) return 1;
  return Math.min(Math.max((now - start) / (g.target - start), 0), 1);
}
