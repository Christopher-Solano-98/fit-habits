// Sends a receipt or message to one of the signed-in trainer's clients.
// Called from the app; the user's JWT + row-level security guarantee the
// trainer can only reach their own clients.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import type { Client, Settings } from '../_shared/types.ts';
import { admin, cors, fromRow, json, localNow } from '../_lib/db.ts';
import { sendEmail, sendSms } from '../_lib/send.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: 'unauthorized' }, 401);

  const { clientId, channel, subject, body } = await req.json().catch(() => ({}));
  if (typeof clientId !== 'string' || typeof body !== 'string' || !body.trim() || body.length > 1600) return json({ error: 'bad request' }, 400);
  if (!['text', 'email', 'both'].includes(channel)) return json({ error: 'bad channel' }, 400);

  const { data: cRow } = await userClient.from('clients').select('*').eq('id', clientId).maybeSingle();
  if (!cRow) return json({ error: 'client not found' }, 404);
  const c = fromRow<Client>(cRow);
  const { data: sRow } = await userClient.from('settings').select('*').maybeSingle();
  const s = sRow ? fromRow<Settings>(sRow) : null;
  const today = localNow(s?.timezone ?? 'America/New_York').date;

  const db = admin();
  let sent = false;
  const log = (ch: 'text' | 'email', to: string, r: { ok: boolean; error?: string }) =>
    db.from('notices').insert({ owner_id: auth.user!.id, client_id: c.id, kind: 'receipt', channel: ch, to_address: to, body, status: r.ok ? 'sent' : 'failed', error: r.error ?? null, local_date: today });

  if ((channel === 'text' || channel === 'both') && c.phone) {
    const r = await sendSms(c.phone, body);
    await log('text', c.phone, r);
    sent ||= r.ok;
  }
  if ((channel === 'email' || channel === 'both') && c.email) {
    const r = await sendEmail(c.email, subject || `${s?.businessName ?? 'Fit Habits'}`, body, s?.email || undefined);
    await log('email', c.email, r);
    sent ||= r.ok;
  }
  return json({ sent });
});
