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
  | 'restingHr' | 'systolic' | 'diastolic'
  | 'pushups' | 'plank' | 'mile' | 'squat' | 'bench' | 'deadlift';

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
  metric: MetricKey;
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
  motivation: { enabled: boolean; weekday: number; time: string; channel: Channel };
  alerts: { missedPayments: boolean; graceDays: number; emailTime: string };
  reports: { weekly: boolean; biweekly: boolean; monthly: boolean };
  scanReminderMonths: number;
  timezone: string; // IANA zone used by the scheduled jobs, e.g. America/New_York
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
}

export type TableName = Exclude<keyof Snapshot, 'settings'>;
