import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { IntakeAnswers } from '@shared/types.ts';
import { applyIntake, buildResponses, INTAKE_CONSENT, INTAKE_GENDERS, INTAKE_QUESTIONS, normalizeAnswers, type IntakeRaw } from '@shared/intakeForm.ts';
import { DEFAULT_WAIVER, signedWaiverHtml } from '@shared/waiver.ts';
import { localRepo } from '../data/local';
import { fileToBase64, gasCall } from '../data/connection';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';

// Public page a client opens from the texted link. It never sees the trainer's
// data: in cloud mode it talks only to the `intake` Edge Function, which checks
// the one-time token server-side.

interface Info { firstName: string; business: string; completed: boolean; waiverText?: string; trainer?: string }

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

async function loadInfo(token: string, api: string | null): Promise<Info | null> {
  if (api) return gasCall<Info>(api, { action: 'intakeInfo', token });
  if (url && anon) {
    const res = await fetch(`${url}/functions/v1/intake?token=${encodeURIComponent(token)}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    return res.ok ? res.json() : null;
  }
  const snap = await localRepo().load();
  const req = snap.intakes.find((i) => i.token === token);
  const c = req && snap.clients.find((x) => x.id === req.clientId);
  return req && c ? { firstName: c.firstName, business: snap.settings.businessName, completed: !!req.completedAt, waiverText: snap.settings.waiverText, trainer: snap.settings.trainerName } : null;
}

interface Sent { responses: IntakeRaw; profile: IntakeAnswers['profile']; emergencyName: string; emergencyPhone: string; signature: string; waiverText: string }

async function submit(token: string, sent: Sent, id: File | null, api: string | null): Promise<void> {
  const answers = sent as unknown as Record<string, unknown>;
  if (api) {
    await gasCall(api, { action: 'intakeSubmit', token, answers, id: id ? await fileToBase64(id) : null });
    return;
  }
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
  const done = normalizeAnswers(answers, { business: snap.settings.businessName, waiverText: snap.settings.waiverText || DEFAULT_WAIVER, now: new Date().toISOString() });
  const name = `${c.firstName} ${c.lastName}`.trim();
  const html = signedWaiverHtml({ business: snap.settings.businessName, clientName: name, waiverText: done.waiverText ?? DEFAULT_WAIVER, answers: done });
  await repo.uploadFile(c.id, 'waiver', new File([html], `Signed waiver - ${name} - ${done.signedAt.slice(0, 10)}.html`, { type: 'text/html' }));
  await repo.put('intakes', { ...req, completedAt: new Date().toISOString(), answers: done });
  await repo.put('clients', applyIntake(c, done));
}

export function Intake() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const apiParam = params.get('api');
  const api = apiParam && apiParam.startsWith('https://script.google.com/') ? apiParam : null;
  // Opened from the trainer's app ("Fill out on this phone") rather than a texted link.
  const fromApp = params.get('from') === 'app';
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [resp, setResp] = useState<IntakeRaw>({});
  const [profile, setProfile] = useState({ birthDate: '', gender: '', phone: '', address: '' });
  const [f, setF] = useState({ emergencyName: '', emergencyPhone: '', signature: '' });
  const [agree, setAgree] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const idInput = useRef<HTMLInputElement>(null);

  useEffect(() => { loadInfo(token!, api).then(setInfo).catch(() => setInfo(null)); }, [token, api]);

  if (info === undefined) return <div className="center-screen"><p className="muted">Loading…</p></div>;
  if (!info) return <div className="center-screen"><p><strong>This link isn't valid.</strong></p><p className="muted">Ask your trainer to send a new one.</p></div>;
  if (info.completed || sent) {
    return (
      <div className="center-screen">
        <span className="done-check"><Icon name="check" size={38} stroke={2.6} /></span>
        <h1 className="display">You're all set{info.firstName ? `, ${info.firstName}` : ''}</h1>
        <p className="muted">Your intake form is with {info.business}. See you at your next session.</p>
        {fromApp && <button className="btn btn-dark" onClick={() => history.back()}>Back to the app</button>}
      </div>
    );
  }

  const waiverText = info.waiverText || DEFAULT_WAIVER;
  const business = info.business || 'Fit Habits';
  const consent = INTAKE_CONSENT(business);
  const setAnswer = (id: string, patch: { answer?: string; detail?: string }) => setResp((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const go = async (e: FormEvent) => {
    e.preventDefault();
    try {
      buildResponses(resp);
    } catch (x) {
      return setErr((x as Error).message);
    }
    if (!agree || !f.signature.trim()) return setErr('Please read the consent and waiver, check the box and type your full name to sign.');
    setErr(''); setBusy(true);
    try {
      await submit(token!, { ...f, responses: resp, profile, waiverText }, idFile, api);
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
      {fromApp && <button type="button" className="back" onClick={() => history.back()}><Icon name="back" /> Back</button>}
      <Brand variant="full" />
      <h1 className="display">Welcome, {info.firstName}</h1>
      <p className="muted">This takes about 5 minutes. Your answers go only to {info.trainer || 'Tony'} and are stored securely with {info.business || 'Fit Habits'}.</p>

      <h2 className="intake-title">{business} (PAR-Q)</h2>

      <fieldset>
        <legend>Personal information</legend>
        <div className="grid2">
          <label>Date of birth<input type="date" value={profile.birthDate} onChange={(e) => setProfile({ ...profile, birthDate: e.target.value })} /></label>
          <label>Contact number<input type="tel" autoComplete="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
        </div>
        <div className="parq-q">
          <p>Gender</p>
          <div className="seg">
            {INTAKE_GENDERS.map((g) => <button type="button" key={g} aria-pressed={profile.gender === g} className={profile.gender === g ? 'on' : ''} onClick={() => setProfile({ ...profile, gender: g })}>{g}</button>)}
          </div>
        </div>
        <label>Address<input autoComplete="street-address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></label>
      </fieldset>

      {[...new Set(INTAKE_QUESTIONS.map((q) => q.section))].map((section) => (
        <fieldset key={section}>
          <legend>{section}</legend>
          {INTAKE_QUESTIONS.map((q, i) => q.section === section && (
            <div className="parq-q" key={q.id}>
              <p>{i + 1}. {q.q}</p>
              {q.kind === 'yesno' && (
                <>
                  <div className="seg">
                    {['Yes', 'No'].map((v) => (
                      <button type="button" key={v} aria-pressed={resp[q.id]?.answer === v} className={resp[q.id]?.answer === v ? 'on' : ''} onClick={() => setAnswer(q.id, { answer: v })}>{v}</button>
                    ))}
                  </div>
                  {q.detail && resp[q.id]?.answer === 'Yes' && (
                    <label>{q.detail}<textarea rows={2} value={resp[q.id]?.detail ?? ''} onChange={(e) => setAnswer(q.id, { detail: e.target.value })} /></label>
                  )}
                </>
              )}
              {q.kind === 'choice' && (
                <div className="choice-list">
                  {q.options.map((o) => (
                    <button type="button" key={o} aria-pressed={resp[q.id]?.answer === o} className={resp[q.id]?.answer === o ? 'on' : ''} onClick={() => setAnswer(q.id, { answer: o })}>{o}</button>
                  ))}
                </div>
              )}
              {q.kind === 'text' && (
                <textarea rows={3} placeholder={q.placeholder} value={resp[q.id]?.answer ?? ''} onChange={(e) => setAnswer(q.id, { answer: e.target.value })} />
              )}
            </div>
          ))}
        </fieldset>
      ))}
      {Object.values(resp).some((r) => r?.answer === 'Yes') && <p className="warn-text small">You answered "Yes" to at least one question. That's OK. {info.trainer || 'Your trainer'} will go over it with you before you start, and you may need a note from your doctor.</p>}

      <fieldset>
        <legend>Emergency contact</legend>
        <div className="grid2">
          <label>Name<input {...field('emergencyName')} /></label>
          <label>Phone<input type="tel" {...field('emergencyPhone')} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Photo ID</legend>
        <input ref={idInput} type="file" hidden accept="image/*,application/pdf" onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="btn btn-outline btn-block" onClick={() => idInput.current?.click()}>
          <Icon name="upload" size={16} /> {idFile ? `Added: ${idFile.name}` : 'Add a photo or PDF of your ID'}
        </button>
        <p className="small">Take a new photo, pick one from your photos, or choose a PDF from Files.</p>
      </fieldset>

      <fieldset>
        <legend>Consent and waiver</legend>
        <ul className="small consent">{consent.map((t) => <li key={t}>{t}</li>)}</ul>
        <div className="small waiver">{waiverText.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</div>
        <label className="check-row"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to the statements above and the waiver</label>
        <label>Type your full name to sign<input {...field('signature')} autoComplete="name" /></label>
      </fieldset>

      {err && <p className="warn-text">{err}</p>}
      <button className="btn btn-block btn-lg" disabled={busy} type="submit">{busy ? 'Sending…' : 'Submit'}</button>
    </form>
  );
}
