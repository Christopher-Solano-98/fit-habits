// Shared by the web app (Vite) and the Supabase Edge Functions (Deno), so keep
// this folder dependency-free and use explicit .ts import paths.

export type BillingCycle = 'weekly' | 'biweekly' | 'monthly' | 'per_session';
export type Channel = 'text' | 'email' | 'both' | 'none';
export type FileKind = 'id' | 'parq' | 'medical' | 'waiver' | 'scan' | 'photo' | 'other';

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null; // YYYY-MM-DD
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  sessionDays: number[]; // 0 = Sunday … 6 = Saturday
  sessionTime: string | null; // "6:00 AM"
  rate: number;
  cycle: BillingCycle;
  dueWeekday: number; // weekly / biweekly: day of week payment is due
  dueDayOfMonth: number; // monthly: day of month payment is due
  channel: Channel; // how this client prefers receipts and messages
  medicalCurrent: string | null;
  medicalPast: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  startDate: string; // YYYY-MM-DD
  active: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  clientId: string;
  amount: number;
  paidOn: string; // YYYY-MM-DD (cash only: no payment method field)
  note: string | null;
  receiptVia: Channel;
  createdAt: string;
}

export type MetricKey =
  | 'weight' | 'bodyFat' | 'leanMass' | 'bmi'
  | 'waist' | 'hips' | 'chest' | 'arm' | 'thigh'
  | 'restingHr' | 'systolic' | 'diastolic';

/** weight = best lb (with reps), reps = most reps, hold = longest seconds, time = fastest seconds. */
export type ExerciseKind = 'weight' | 'reps' | 'hold' | 'time';

/** A trainer-added exercise. Built-in ones live in code (exercises.ts) and use "b-" ids. */
export interface Exercise {
  id: string;
  name: string;
  group: string; // body part: Chest, Back, … Calisthenics, Cardio
  kind: ExerciseKind;
  createdAt: string;
}

export interface ExerciseLog {
  id: string;
  clientId: string;
  exerciseId: string;
  date: string; // YYYY-MM-DD
  value: number; // lb, reps or seconds depending on the exercise kind
  reps: number | null; // for weight exercises
  note: string | null;
  createdAt: string;
}

export interface Measurement {
  id: string;
  clientId: string;
  takenOn: string;
  values: Partial<Record<MetricKey, number>>;
  note: string | null;
  fileId: string | null; // optional scan report
  createdAt: string;
}

export interface Goal {
  id: string;
  clientId: string;
  metric: string; // a body MetricKey, or "ex:<exercise id>"
  target: number;
  byDate: string | null;
  createdAt: string;
}

export interface ClientFile {
  id: string;
  clientId: string;
  kind: FileKind;
  name: string;
  path: string; // storage path (cloud) or blob key (demo)
  mime: string;
  size: number;
  createdAt: string;
}

export interface Template {
  id: string;
  title: string;
  body: string; // supports {first} {amount} {date} {rate} {schedule} {business}
  sort: number;
}

export interface Motivation {
  id: string;
  body: string;
  sentOn: string | null;
  createdAt: string;
}

export interface IntakeAnswers {
  parq: boolean[]; // one per PARQ_QUESTIONS entry, true = "Yes"
  medicalCurrent: string;
  medicalPast: string;
  emergencyName: string;
  emergencyPhone: string;
  signature: string; // typed full name
  signedAt: string;
  waiverText?: string; // the exact wording they agreed to
}

export interface IntakeRequest {
  id: string;
  clientId: string;
  token: string;
  createdAt: string;
  completedAt: string | null;
  answers: IntakeAnswers | null;
}

export interface Settings {
  id: string;
  trainerName: string;
  businessName: string;
  email: string;
  phone: string;
  /** excluded: clients taken off the weekly list (everyone else, including new clients, is on it). */
  motivation: { enabled: boolean; weekday: number; time: string; channel: Channel; excluded?: string[] };
  alerts: { missedPayments: boolean; graceDays: number; emailTime: string };
  reports: { weekly: boolean; biweekly: boolean; monthly: boolean };
  scanReminderMonths: number;
  timezone: string; // IANA zone used by the scheduled jobs, e.g. America/New_York
  waiverText: string; // shown on the client intake form and saved with each signature
}

export interface Snapshot {
  settings: Settings;
  clients: Client[];
  payments: Payment[];
  measurements: Measurement[];
  goals: Goal[];
  files: ClientFile[];
  templates: Template[];
  motivations: Motivation[];
  intakes: IntakeRequest[];
  exercises: Exercise[];
  exerciseLogs: ExerciseLog[];
  workouts: Workout[];
  sessions: Session[];
}

/** One exercise in a workout. In a session it can be checked off with a result. */
export interface WorkoutItem {
  id: string;
  exerciseId: string;
  plan: string; // free text: "3 × 10", "4 × 8 @ 135", "1 mile"
  done?: boolean;
  value?: number | null; // result: lb, reps or seconds (by exercise kind)
  reps?: number | null; // result reps for weight exercises
  logId?: string | null; // the exercise log this result was saved as
}

/** A reusable workout in the trainer's library. */
export interface Workout {
  id: string;
  name: string;
  items: WorkoutItem[];
  createdAt: string;
  updatedAt: string;
}

/** A workout for one client on one day. */
export interface Session {
  id: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  name: string;
  items: WorkoutItem[];
  workoutId: string | null; // the library workout it came from, if any
  completedAt: string | null;
  note: string | null;
  createdAt: string;
}

export type TableName = Exclude<keyof Snapshot, 'settings'>;
