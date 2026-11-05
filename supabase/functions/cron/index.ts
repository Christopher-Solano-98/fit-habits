// Runs hourly (see supabase/cron.sql). For each trainer, in their timezone:
//  - weekly motivation at the chosen day/hour, to every active client
//  - daily missed-payment + scan-due email at alerts.emailTime
//  - weekly report Fridays 6 PM, biweekly every other Friday, monthly on the 1st
// Every send is logged in `notices`, which also stops repeats within a day.
import type { Client, Measurement, Motivation, Payment, Settings } from '../_shared/types.ts';
import { needsAttention, payStatus, sumPayments } from '../_shared/billing.ts';
import { addDays, addMonths, endOfMonth, fmtShort, startOfMonth, startOfWeek } from '../_shared/dates.ts';
import { series } from '../_shared/metrics.ts';
import { admin, fromRow, json, localNow } from '../_lib/db.ts';
import { sendEmail, sendSms } from '../_lib/send.ts';

const db = admin();

async function alreadyDone(owner: string, kind: string, date: string): Promise<boolean> {
  const { count } = await db.from('notices').select('id', { count: 'exact', head: true }).eq('owner_id', owner).eq('kind', kind).eq('local_date', date);
  return (count ?? 0) > 0;
}

async function log(owner: string, kind: string, channel: string, to: string, body: string, r: { ok: boolean; error?: string }, date: string, clientId: string | null = null) {
  await db.from('notices').insert({ owner_id: owner, client_id: clientId, kind, channel, to_address: to, body: body.slice(0, 4000), status: r.ok ? 'sent' : 'failed', error: r.error ?? null, local_date: date });
}

const money = (n: number) => '$' + n.toLocaleString('en-US');
const name = (c: Client) => `${c.firstName} ${c.lastName}`.trim();

function report(label: string, from: string, to: string, clients: Client[], payments: Payment[], s: Settings): string {
  const pays = payments.filter((p) => p.paidOn >= from && p.paidOn <= to);
  const paid = clients.map((c) => ({ c, t: pays.filter((p) => p.clientId === c.id).reduce((a, p) => a + p.amount, 0) })).filter((x) => x.t > 0);
  const unpaid = clients.filter((c) => c.active && c.rate > 0 && !pays.some((p) => p.clientId === c.id));
  return [
    `${s.businessName}: ${label} (${fmtShort(from)} – ${fmtShort(to)})`,
    `Collected ${money(sumPayments(payments, from, to))} from ${pays.length} payment${pays.length === 1 ? '' : 's'}.`,
    '', 'PAID', ...(paid.length ? paid.map((x) => `  ${name(x.c)}: ${money(x.t)}`) : ['  Nobody yet']),
    '', 'NO PAYMENT LOGGED', ...(unpaid.length ? unpaid.map((c) => `  ${name(c)}`) : ['  Nobody. Everyone paid!']),
  ].join('\n');
}

async function runFor(s: Settings & { ownerId: string }, now: Date) {
  const owner = s.ownerId;
  const t = localNow(s.timezone, now);
  const [cRes, pRes, mRes] = await Promise.all([
    db.from('clients').select('*').eq('owner_id', owner),
    db.from('payments').select('*').eq('owner_id', owner).gte('paid_on', addMonths(t.date, -3)),
    db.from('measurements').select('*').eq('owner_id', owner),
  ]);
  const clients = (cRes.data ?? []).map((r) => fromRow<Client>(r));
  const payments = (pRes.data ?? []).map((r) => fromRow<Payment>(r));
  const measurements = (mRes.data ?? []).map((r) => fromRow<Measurement>(r));
  const active = clients.filter((c) => c.active);
  const done: string[] = [];

  // Weekly motivation
  const m = s.motivation;
  if (m.enabled && t.weekday === m.weekday && t.hour === Number(m.time.slice(0, 2)) && !(await alreadyDone(owner, 'motivation', t.date))) {
    const { data } = await db.from('motivations').select('*').eq('owner_id', owner).order('sent_on', { ascending: true, nullsFirst: true }).order('created_at').limit(1);
    const msg = data?.[0] ? fromRow<Motivation>(data[0]) : null;
    if (msg) {
      for (const c of active) {
        const wantText = (m.channel === 'text' || m.channel === 'both') && (c.channel === 'text' || c.channel === 'both');
        const wantEmail = (m.channel === 'email' || m.channel === 'both') && (c.channel === 'email' || c.channel === 'both');
        if (wantText && c.phone) await log(owner, 'motivation', 'text', c.phone, msg.body, await sendSms(c.phone, msg.body), t.date, c.id);
        if (wantEmail && c.email) await log(owner, 'motivation', 'email', c.email, msg.body, await sendEmail(c.email, `Your ${s.businessName} motivation`, `Hey ${c.firstName},\n\n${msg.body}\n\n- ${s.trainerName}`, s.email), t.date, c.id);
      }
      await db.from('motivations').update({ sent_on: t.date }).eq('id', msg.id);
      done.push('motivation');
    }
  }

  if (!s.email) return done;

  // Daily missed-payment and scan-due email
  if (s.alerts.missedPayments && t.hour === Number(s.alerts.emailTime.slice(0, 2)) && !(await alreadyDone(owner, 'alert', t.date))) {
    const late = active.map((c) => ({ c, st: payStatus(c, payments, t.date) })).filter((x) => needsAttention(x.st) && x.st.daysLate >= s.alerts.graceDays);
    const scans = active.map((c) => {
      const pts = series(measurements, c.id, 'bodyFat');
      return { c, due: pts.length ? addMonths(pts[pts.length - 1].date, s.scanReminderMonths) : null };
    }).filter((x) => x.due && x.due <= addDays(t.date, 7));
    if (late.length || scans.length) {
      const body = [
        ...(late.length ? ['Payments not logged yet:', ...late.map((x) => `  ${name(x.c)}: ${money(x.st.owed)} (${x.st.label})`), ''] : []),
        ...(scans.length ? ['Body scans due:', ...scans.map((x) => `  ${name(x.c)}: ${fmtShort(x.due!)}`), ''] : []),
        'Open the Fit Habits app to log payments or text a reminder.',
      ].join('\n');
      const subject = late.length ? `${late.length} payment${late.length === 1 ? '' : 's'} not logged` : 'Body scans coming up';
      await log(owner, 'alert', 'email', s.email, body, await sendEmail(s.email, subject, body), t.date);
      done.push('alert');
    }
  }

  // Reports
  const isFriday6pm = t.weekday === 5 && t.hour === 18;
  const week = startOfWeek(t.date);
  if (isFriday6pm && s.reports.weekly && !(await alreadyDone(owner, 'report-weekly', t.date))) {
    const body = report('weekly report', week, addDays(week, 6), clients, payments, s);
    await log(owner, 'report-weekly', 'email', s.email, body, await sendEmail(s.email, `Who paid this week`, body), t.date);
    done.push('weekly');
  }
  const weekNo = Math.floor((Date.parse(week) / 864e5 + 3) / 7);
  if (isFriday6pm && s.reports.biweekly && weekNo % 2 === 0 && !(await alreadyDone(owner, 'report-biweekly', t.date))) {
    const body = report('2-week summary', addDays(week, -7), addDays(week, 6), clients, payments, s);
    await log(owner, 'report-biweekly', 'email', s.email, body, await sendEmail(s.email, `Your 2-week summary`, body), t.date);
    done.push('biweekly');
  }
  if (t.date.endsWith('-01') && t.hour === 8 && s.reports.monthly && !(await alreadyDone(owner, 'report-monthly', t.date))) {
    const last = addDays(t.date, -1);
    const body = report('monthly summary', startOfMonth(last), endOfMonth(last), clients, payments, s);
    await log(owner, 'report-monthly', 'email', s.email, body, await sendEmail(s.email, `Your monthly summary`, body), t.date);
    done.push('monthly');
  }
  return done;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  const now = new Date();
  const { data } = await db.from('settings').select('*');
  const results: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const s = fromRow<Settings & { ownerId: string }>(row);
    try {
      results[s.ownerId] = await runFor(s, now);
    } catch (e) {
      results[s.ownerId] = [`error: ${(e as Error).message}`];
    }
  }
  return json({ ok: true, results });
});
