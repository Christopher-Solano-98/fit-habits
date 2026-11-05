import type { Goal, Measurement, MetricKey } from './types.ts';

/** How a tracked number is shown and judged: body metrics and exercises both use this. */
export interface TrackDef {
  key: string;
  label: string;
  unit: string;
  better: 'up' | 'down';
  time?: boolean; // stored as seconds, shown as m:ss
}

export interface MetricDef extends TrackDef {
  key: MetricKey;
  group: 'Body' | 'Measurements' | 'Health';
  step: number;
}

// Body measurements only. Exercises (lifts, calisthenics, cardio) live in exercises.ts.
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
];

export const METRIC_GROUPS = ['Body', 'Measurements', 'Health'] as const;

export function metric(key: MetricKey): MetricDef {
  return METRICS.find((m) => m.key === key)!;
}

export function isMetric(key: string): key is MetricKey {
  return METRICS.some((m) => m.key === key);
}

function round(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function fmtWith(d: Pick<TrackDef, 'unit' | 'time'>, v: number): string {
  if (d.time) {
    const s = Math.round(v);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  return d.unit === '%' ? `${round(v)}%` : d.unit ? `${round(v)} ${d.unit}` : round(v);
}

export function fmtValue(key: MetricKey, v: number): string {
  return fmtWith(metric(key), v);
}

/** Parses "7:45" (or plain seconds) for time values, plain numbers otherwise. */
export function parseWith(d: Pick<TrackDef, 'time'>, raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (d.time && s.includes(':')) {
    const [m, sec] = s.split(':').map(Number);
    return Number.isFinite(m) && Number.isFinite(sec) ? m * 60 + sec : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseValue(key: MetricKey, raw: string): number | null {
  return parseWith(metric(key), raw);
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

export function changeWith(d: TrackDef, pts: Point[]): Change | null {
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const delta = last.value - first.value;
  const good = delta === 0 ? true : (delta < 0) === (d.better === 'down');
  const size = d.time ? fmtWith(d, Math.abs(delta)) : d.unit === '%' ? `${round(Math.abs(delta))} pts` : `${round(Math.abs(delta))}${d.unit ? ' ' + d.unit : ''}`;
  const text = delta === 0 ? 'No change' : d.time ? `${delta < 0 ? 'Down' : 'Up'} ${size}` : `${delta < 0 ? 'Down' : 'Up'} ${size}`;
  return { first, last, delta, good, text };
}

export function change(key: MetricKey, pts: Point[]): Change | null {
  return changeWith(metric(key), pts);
}

/** 0–1 progress from the first recorded value toward the goal target. */
export function goalProgress(g: Goal, pts: Point[]): number | null {
  if (!pts.length) return null;
  const start = pts[0].value, now = pts[pts.length - 1].value;
  if (start === g.target) return 1;
  return Math.min(Math.max((now - start) / (g.target - start), 0), 1);
}
