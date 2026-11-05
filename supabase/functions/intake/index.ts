// Public endpoint behind the intake link a client receives by text.
// GET  ?token=…  → first name + business name (nothing else is exposed)
// POST multipart (token, answers JSON, optional id photo) → saves the form.
import type { IntakeAnswers } from '../_shared/types.ts';
import { PARQ_QUESTIONS } from '../_shared/parq.ts';
import { admin, cors, json } from '../_lib/db.ts';

const MAX_AGE_DAYS = 21;
const MAX_ID_BYTES = 10 * 1024 * 1024;

async function findRequest(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const db = admin();
  const { data } = await db.from('intakes').select('id, owner_id, client_id, created_at, completed_at').eq('token', token).maybeSingle();
  if (!data) return null;
  if (Date.now() - new Date(data.created_at).getTime() > MAX_AGE_DAYS * 864e5) return null;
  return data;
}

const clip = (v: unknown, n = 2000) => (typeof v === 'string' ? v.slice(0, n) : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();

  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    const r = await findRequest(token);
    if (!r) return json({ error: 'not found' }, 404);
    const [{ data: c }, { data: s }] = await Promise.all([
      db.from('clients').select('first_name').eq('id', r.client_id).single(),
      db.from('settings').select('business_name').eq('owner_id', r.owner_id).maybeSingle(),
    ]);
    return json({ firstName: c?.first_name ?? '', business: s?.business_name ?? 'Fit Habits', completed: !!r.completed_at });
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: 'bad request' }, 400);
  const r = await findRequest(String(form.get('token') ?? ''));
  if (!r) return json({ error: 'This link has expired. Ask your trainer for a new one.' }, 404);
  if (r.completed_at) return json({ error: 'Already submitted' }, 409);

  let raw: Record<string, unknown>;
  try { raw = JSON.parse(String(form.get('answers') ?? '{}')); } catch { return json({ error: 'bad answers' }, 400); }
  const parq = Array.isArray(raw.parq) ? raw.parq.map(Boolean).slice(0, PARQ_QUESTIONS.length) : [];
  if (parq.length !== PARQ_QUESTIONS.length || !clip(raw.signature, 200).trim()) return json({ error: 'Please answer every question and sign.' }, 400);
  const answers: IntakeAnswers = {
    parq,
    medicalCurrent: clip(raw.medicalCurrent), medicalPast: clip(raw.medicalPast),
    emergencyName: clip(raw.emergencyName, 200), emergencyPhone: clip(raw.emergencyPhone, 50),
    signature: clip(raw.signature, 200), signedAt: new Date().toISOString(),
  };

  const id = form.get('id');
  if (id instanceof File && id.size > 0) {
    if (id.size > MAX_ID_BYTES || !id.type.startsWith('image/')) return json({ error: 'ID photo must be an image under 10 MB' }, 400);
    const fileId = crypto.randomUUID();
    const path = `${r.owner_id}/${r.client_id}/${fileId}-photo-id`;
    const up = await db.storage.from('client-files').upload(path, id, { contentType: id.type });
    if (up.error) return json({ error: 'Upload failed, please try again' }, 500);
    await db.from('files').insert({ id: fileId, owner_id: r.owner_id, client_id: r.client_id, kind: 'id', name: 'Photo ID', path, mime: id.type, size: id.size });
  }

  await db.from('intakes').update({ completed_at: new Date().toISOString(), answers }).eq('id', r.id);
  const patch: Record<string, string> = {};
  if (answers.medicalCurrent) patch.medical_current = answers.medicalCurrent;
  if (answers.medicalPast) patch.medical_past = answers.medicalPast;
  if (answers.emergencyName) patch.emergency_name = answers.emergencyName;
  if (answers.emergencyPhone) patch.emergency_phone = answers.emergencyPhone;
  if (Object.keys(patch).length) await db.from('clients').update(patch).eq('id', r.client_id);
  return json({ ok: true });
});
