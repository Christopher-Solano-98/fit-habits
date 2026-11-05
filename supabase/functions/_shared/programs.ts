import type { Exercise, Program, ProgramPhase } from './types.ts';
import { diffDays, addDays, fmtShort } from './dates.ts';

export const DEFAULT_PHASES: ProgramPhase[] = [
  { label: 'Foundation', note: 'Learn the movements, moderate weight, perfect form.' },
  { label: 'Progress', note: 'Add weight or reps.' },
  { label: 'Regress (deload)', note: 'Back off to recover: lighter and fewer sets.' },
  { label: 'Peak', note: 'Heaviest and hardest weeks. Test your bests.' },
];

export const totalWeeks = (p: Pick<Program, 'phases' | 'phaseWeeks'>) => p.phases.length * p.phaseWeeks;

/** "Weeks 1–2" */
export function phaseWeeksLabel(p: Pick<Program, 'phaseWeeks'>, i: number): string {
  const a = i * p.phaseWeeks + 1, b = a + p.phaseWeeks - 1;
  return a === b ? `Week ${a}` : `Weeks ${a}–${b}`;
}

/** "Nov 9 – Nov 22" for phase i of a dated program. */
export function phaseDates(p: Pick<Program, 'phaseWeeks' | 'startDate'>, i: number): string | null {
  if (!p.startDate) return null;
  const from = addDays(p.startDate, i * p.phaseWeeks * 7);
  return `${fmtShort(from)} – ${fmtShort(addDays(from, p.phaseWeeks * 7 - 1))}`;
}

export interface ProgramPosition {
  week: number; // 1-based; 0 = not started yet; > total = finished
  phase: number; // index into phases, clamped
  status: 'upcoming' | 'active' | 'done';
}

export function programPosition(p: Pick<Program, 'phases' | 'phaseWeeks' | 'startDate'>, today: string): ProgramPosition {
  if (!p.startDate) return { week: 0, phase: 0, status: 'upcoming' };
  const days = diffDays(today, p.startDate);
  if (days < 0) return { week: 0, phase: 0, status: 'upcoming' };
  const week = Math.floor(days / 7) + 1;
  const total = totalWeeks(p);
  if (week > total) return { week, phase: p.phases.length - 1, status: 'done' };
  return { week, phase: Math.min(Math.floor((week - 1) / p.phaseWeeks), p.phases.length - 1), status: 'active' };
}

/** The trainer's own how-to link for an exercise, else a YouTube search for it. */
export function howToUrl(e: Pick<Exercise, 'id' | 'name'>, links: Record<string, string> | undefined): string {
  const own = links?.[e.id];
  if (own) return own;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to do ${e.name} exercise`)}`;
}
