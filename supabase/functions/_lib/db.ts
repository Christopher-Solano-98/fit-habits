// Deno-only helpers for the Edge Functions (not bundled into the web app).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import type { Client, Payment, Settings } from '../_shared/types.ts';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
export function fromRow<T>(r: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), typeof v === 'string' && /^(rate|amount)$/.test(k) ? Number(v) : v])) as T;
}

export type Rows = { settings: Settings & { ownerId: string }; clients: Client[]; payments: Payment[] };

/** Local calendar date/time parts in the trainer's timezone. */
export function localNow(timezone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday };
}
