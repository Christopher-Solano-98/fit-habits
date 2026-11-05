import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { IntakeAnswers } from '@shared/types.ts';
import { PARQ_QUESTIONS, PARQ_SOURCE } from '@shared/parq.ts';
import { localRepo } from '../data/local';
import { Icon } from '../components/Icon';

// Public page a client opens from the texted link. It never sees the trainer's
// data: in cloud mode it talks only to the `intake` Edge Function, which checks
// the one-time token server-side.

interface Info { firstName: string; business: string; completed: boolean }

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

async function loadInfo(token: string): Promise<Info | null> {
  if (url && anon) {
    const res = await fetch(`${url}/functions/v1/intake?token=${encodeURIComponent(token)}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    return res.ok ? res.json() : null;
  }
  const snap = await localRepo().load();
  const req = snap.intakes.find((i) => i.token === token);
  const c = req && snap.clients.find((x) => x.id === req.clientId);
  return req && c ? { firstName: c.firstName, business: snap.settings.businessName, completed: !!req.completedAt } : null;
}

async function submit(token: string, answers: IntakeAnswers, id: File | null): Promise<void> {
  if (url && anon) {
    const body = new FormData();
    body.set('token', token);
    body.set('answers', JSON.stringify(answers));
    if (id) body.set('id', id);
    const res = await fetch(`${url}/functions/v1/intake`, { method: 'POST', body, headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    if (!res.ok) throw new Error((await res.text()) || 'Could not submit');
    return;
  }
  const repo = localRepo();
  const snap = await repo.load();
  const req = snap.intakes.find((i) => i.token === token)!;
  const c = snap.clients.find((x) => x.id === req.clientId)!;
  if (id) await repo.uploadFile(c.id, 'id', id);
  await repo.put('intakes', { ...req, completedAt: new Date().toISOString(), answers });
  await repo.put('clients', { ...c, medicalCurrent: answers.medicalCurrent || c.medicalCurrent, medicalPast: answers.medicalPast || c.medicalPast, emergencyName: answers.emergencyName || c.emergencyName, emergencyPhone: answers.emergencyPhone || c.emergencyPhone });
}

export function Intake() {
  const { token } = useParams();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [parq, setParq] = useState<(boolean | null)[]>(PARQ_QUESTIONS.map(() => null));
  const [f, setF] = useState({ medicalCurrent: '', medicalPast: '', emergencyName: '', emergencyPhone: '', signature: '' });
  const [agree, setAgree] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const idInput = useRef<HTMLInputElement>(null);

  useEffect(() => { loadInfo(token!).then(setInfo).catch(() => setInfo(null)); }, [token]);

  if (info === undefined) return <div className="center-screen"><p className="muted">Loading…</p></div>;
  if (!info) return <div className="center-screen"><p><strong>This link isn't valid.</strong></p><p className="muted">Ask your trainer to send a new one.</p></div>;
  if (info.completed || sent) {
    return (
      <div className="center-screen">
        <span className="done-check"><Icon name="check" size={38} stroke={2.6} /></span>
        <h1 className="display">You're all set{info.firstName ? `, ${info.firstName}` : ''}</h1>
        <p className="muted">Your intake form is with {info.business}. See you at your next session.</p>
      </div>
    );
  }

  const go = async (e: FormEvent) => {
    e.preventDefault();
    if (parq.some((a) => a === null)) return setErr('Please answer every health question.');
    if (!agree || !f.signature.trim()) return setErr('Please read the waiver, check the box and type your full name to sign.');
    setErr(''); setBusy(true);
    try {
      await submit(token!, { ...f, parq: parq as boolean[], signedAt: new Date().toISOString() }, idFile);
      setSent(true);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  return (
    <form className="page form intake" onSubmit={go}>
      <div className="brand">{info.business.toUpperCase()}</div>
      <h1 className="display">Welcome, {info.firstName}</h1>
      <p className="muted">This takes about 5 minutes. Your answers go only to your trainer and are stored securely.</p>

      <fieldset>
        <legend>Health questions (PAR-Q+)</legend>
        {PARQ_QUESTIONS.map((q, i) => (
          <div className="parq-q" key={i}>
            <p>{i + 1}. {q}</p>
            <div className="seg">
              {[true, false].map((v) => (
                <button type="button" key={String(v)} aria-pressed={parq[i] === v} className={parq[i] === v ? 'on' : ''} onClick={() => setParq(parq.map((a, j) => (j === i ? v : a)))}>{v ? 'Yes' : 'No'}</button>
              ))}
            </div>
          </div>
        ))}
        {parq.some((a) => a === true) && <p className="warn-text small">You answered "Yes" to at least one question. That's OK. Your trainer will follow up with the rest of the <a href={PARQ_SOURCE} target="_blank" rel="noreferrer">PAR-Q+</a> before you start, and you may need a note from your doctor.</p>}
      </fieldset>

      <fieldset>
        <legend>Medical history</legend>
        <label>Current conditions, injuries or medications<textarea rows={2} {...field('medicalCurrent')} /></label>
        <label>Past injuries, surgeries or conditions<textarea rows={2} {...field('medicalPast')} /></label>
      </fieldset>

      <fieldset>
        <legend>Emergency contact</legend>
        <div className="grid2">
          <label>Name<input {...field('emergencyName')} /></label>
          <label>Phone<input type="tel" {...field('emergencyPhone')} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Photo ID</legend>
        <input ref={idInput} type="file" hidden accept="image/*" capture="environment" onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="btn btn-outline btn-block" onClick={() => idInput.current?.click()}>
          <Icon name="upload" size={16} /> {idFile ? idFile.name : 'Take or upload a photo of your ID'}
        </button>
      </fieldset>

      <fieldset>
        <legend>Waiver</legend>
        {/* Placeholder: replace with the trainer's own waiver text before launch. */}
        <p className="small waiver">I understand that physical training involves risk of injury. I confirm the health information above is true and complete, I will tell my trainer about any changes to my health, and I take part voluntarily and accept these risks.</p>
        <label className="check-row"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read and agree to the waiver</label>
        <label>Type your full name to sign<input {...field('signature')} autoComplete="name" /></label>
      </fieldset>

      {err && <p className="warn-text">{err}</p>}
      <button className="btn btn-block btn-lg" disabled={busy} type="submit">{busy ? 'Sending…' : 'Submit'}</button>
    </form>
  );
}
