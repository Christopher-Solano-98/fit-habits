import { useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Client, ClientFile, FileKind, Goal, MetricKey } from '@shared/types.ts';
import { addMonths, ageOn, fmtLong, fmtShort } from '@shared/dates.ts';
import { change, changeWith, fmtValue, fmtWith, goalProgress, isMetric, metric, METRICS, parseWith, series, type TrackDef } from '@shared/metrics.ts';
import { exerciseDef, exerciseSeries, fmtLog, trackDef, trackedExercises, trackSeries } from '@shared/exercises.ts';
import { scheduleText, smsHref, telHref } from '@shared/messages.ts';
import { PARQ_QUESTIONS } from '@shared/parq.ts';
import { useStore } from '../data/store';
import { getConnection } from '../data/connection';
import { nowIso, uid } from '../data/repo';
import { Avatar, Empty, Header, Pill, QuickText, Seg } from '../components/ui';
import { Icon } from '../components/Icon';
import { LineChart } from '../components/LineChart';
import { WorkoutsTab } from './Workouts';
import { fullName, money } from '../lib/util';

type Tab = 'info' | 'pay' | 'workouts' | 'progress' | 'files';

export function ClientDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { client, status, today } = useStore();
  const [texting, setTexting] = useState(false);
  const c = client(id!);
  const tab = (params.get('tab') as Tab) || 'info';
  if (!c) return <div className="page"><Header title="Client not found" back /></div>;
  const st = status(c);

  return (
    <div className="page">
      <Header title="" back action={<Link to={`/clients/${c.id}/edit`} className="btn-sm btn-outline"><Icon name="edit" size={14} /> Edit</Link>} />
      <div className="profile">
        <Avatar c={c} size={64} />
        <div>
          <h1 className="display-sm">{fullName(c)}</h1>
          <div className="small">{[c.birthDate && `${ageOn(c.birthDate, today)}`, c.gender, `since ${fmtShort(c.startDate)} '${c.startDate.slice(2, 4)}`].filter(Boolean).join(' · ')}</div>
          <Pill status={st} />
        </div>
      </div>

      <div className="grid3">
        <a className={`action${c.phone ? '' : ' disabled'}`} href={c.phone ? telHref(c.phone) : undefined} aria-disabled={!c.phone}><Icon name="phone" /> Call</a>
        <button className="action" onClick={() => setTexting(true)}><Icon name="chat" /> Text</button>
        <Link className="action action-primary" to={`/log?client=${c.id}`}><Icon name="cash" /> Log payment</Link>
      </div>

      <Seg<Tab> value={tab} options={[['info', 'Info'], ['pay', 'Pay'], ['workouts', 'Workouts'], ['progress', 'Progress'], ['files', 'Files']]} onChange={(t) => setParams({ tab: t }, { replace: true })} />

      {tab === 'info' && <InfoTab c={c} />}
      {tab === 'pay' && <PaymentsTab c={c} />}
      {tab === 'workouts' && <WorkoutsTab c={c} />}
      {tab === 'progress' && <ProgressTab c={c} />}
      {tab === 'files' && <FilesTab c={c} />}

      {texting && <QuickText client={c} onClose={() => setTexting(false)} />}
    </div>
  );
}

function InfoTab({ c }: { c: Client }) {
  const { status } = useStore();
  const st = status(c);
  const cycle = { weekly: 'week', biweekly: '2 weeks', monthly: 'month', per_session: 'session' }[c.cycle];
  const rows: [string, string | null][] = [
    ['Phone', c.phone], ['Email', c.email], ['Address', c.address],
    ['Schedule', scheduleText(c)],
    ['Rate', c.rate ? `${money(c.rate)} / ${cycle}` : 'Not set'],
    ['Last payment', st.lastPayment ? `${money(st.lastPayment.amount)} on ${fmtShort(st.lastPayment.paidOn)}` : 'None yet'],
    ['Receipts by', { text: 'Text', email: 'Email', both: 'Text + email', none: 'Not sent' }[c.channel]],
    ['Emergency', c.emergencyName ? `${c.emergencyName}${c.emergencyPhone ? ' · ' + c.emergencyPhone : ''}` : null],
    ['Current health', c.medicalCurrent], ['Past health', c.medicalPast], ['Notes', c.notes],
  ];
  return (
    <div className="card">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div className="kv" key={k}><span>{k}</span><span>{v}</span></div>
      ))}
    </div>
  );
}

function PaymentsTab({ c }: { c: Client }) {
  const { snap, del, toast } = useStore();
  const pays = snap.payments.filter((p) => p.clientId === c.id).sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1));
  const total = pays.filter((p) => p.paidOn.slice(0, 4) === new Date().getFullYear().toString()).reduce((t, p) => t + p.amount, 0);
  return (
    <div className="stack">
      <div className="card row"><span className="grow small">Paid this year</span><strong>{money(total)}</strong></div>
      {pays.length === 0 ? <Empty>No payments logged yet.</Empty> : (
        <div className="card">
          {pays.map((p) => (
            <div className="row" key={p.id}>
              <span className="grow">
                <strong>{money(p.amount)} · Cash</strong>
                <span className="small">{fmtLong(p.paidOn)}{p.note ? ` · ${p.note}` : ''}</span>
              </span>
              {p.receiptVia !== 'none' && <span className="ok small"><Icon name="check" size={14} stroke={2.6} /> Receipt</span>}
              <button className="icon-btn sm" aria-label="Delete payment" onClick={() => { if (confirm(`Delete the ${money(p.amount)} payment from ${fmtShort(p.paidOn)}?`)) { del('payments', p.id); toast('Payment deleted'); } }}><Icon name="trash" size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <Link to={`/log?client=${c.id}`} className="btn btn-block">Log a payment</Link>
    </div>
  );
}

function ProgressTab({ c }: { c: Client }) {
  const { snap, save, del, toast, today } = useStore();
  const custom = snap.exercises;
  const body = useMemo(() => METRICS.filter((m) => series(snap.measurements, c.id, m.key).length > 0), [snap.measurements, c.id]);
  const exercises = useMemo(() => trackedExercises(snap.exerciseLogs, c.id, custom), [snap.exerciseLogs, c.id, custom]);
  const [sel, setSel] = useState<MetricKey | null>(null);
  const [addingGoal, setAddingGoal] = useState(false);
  const key = sel && body.some((m) => m.key === sel) ? sel : body[0]?.key;
  const goals = snap.goals.filter((g) => g.clientId === c.id);
  const history = snap.measurements.filter((m) => m.clientId === c.id).sort((a, b) => (a.takenOn < b.takenOn ? 1 : -1));
  const scanPts = series(snap.measurements, c.id, 'bodyFat');
  const nextScan = scanPts.length ? addMonths(scanPts[scanPts.length - 1].date, snap.settings.scanReminderMonths) : null;
  const defs: TrackDef[] = [...body, ...exercises.map(exerciseDef)];
  const pointsFor = (k: string) => trackSeries(k, c.id, snap.measurements, snap.exerciseLogs);

  const shareText = () => {
    const lines = defs.map((d) => {
      const ch = changeWith(d, pointsFor(d.key));
      return ch ? `${d.label}: ${fmtWith(d, ch.first.value)} → ${fmtWith(d, ch.last.value)}` : null;
    }).filter(Boolean);
    return `${c.firstName}, look at your progress!\n${lines.join('\n')}\nKeep going! - ${snap.settings.trainerName}`;
  };

  const pts = key ? series(snap.measurements, c.id, key) : [];
  const ch = key ? change(key, pts) : null;
  const goal = goals.find((g) => g.metric === key);

  return (
    <div className="stack">
      <div className="section-head"><h2>Body</h2><Link className="link-btn" to={`/clients/${c.id}/measure`}>+ Add measurements</Link></div>
      {!key ? (
        <Empty>No body measurements yet. Record a starting point: weight, body fat, tape measurements, blood pressure.</Empty>
      ) : (
        <>
          <div className="chips">
            {body.map((m) => (
              <button key={m.key} className={`chip${m.key === key ? ' on' : ''}`} aria-pressed={m.key === key} onClick={() => setSel(m.key)}>{m.label}</button>
            ))}
          </div>
          <div className="card pad">
            <div className="chart-head">
              <div>
                <span className="small">{metric(key).label}, latest</span>
                <div className="big-num">{fmtValue(key, pts[pts.length - 1].value)}</div>
              </div>
              {ch && <span className={`pill ${ch.good ? 'pill-paid' : 'pill-late'}`}>{ch.text}</span>}
            </div>
            <LineChart def={metric(key)} points={pts} target={goal?.target} />
            {ch && <p className="small">On {fmtLong(ch.first.date)} {c.firstName} was at {fmtValue(key, ch.first.value)}. On {fmtLong(ch.last.date)}: {fmtValue(key, ch.last.value)}.</p>}
          </div>
        </>
      )}

      {nextScan && (
        <div className={`card row${nextScan < today ? ' warn' : ''}`}>
          <Icon name="calendar" />
          <span className="grow"><strong>Next body scan {nextScan < today ? 'overdue' : 'due'} {fmtLong(nextScan)}</strong><span className="small">Every {snap.settings.scanReminderMonths} months, based on the last scan</span></span>
        </div>
      )}

      <div className="section-head"><h2>Exercises</h2><Link className="link-btn" to={`/clients/${c.id}/exercise/new`}>+ Add exercise</Link></div>
      {exercises.length === 0 ? (
        <Empty>No exercises yet. Tap "+ Add exercise" to pick from the library (by body part, calisthenics, cardio) or create your own, then log {c.firstName}'s numbers.</Empty>
      ) : (
        <div className="card">
          {exercises.map((e) => {
            const logs = snap.exerciseLogs.filter((l) => l.clientId === c.id && l.exerciseId === e.id).sort((a, b) => (a.date < b.date ? 1 : -1));
            const exCh = changeWith(exerciseDef(e), exerciseSeries(snap.exerciseLogs, c.id, e.id));
            return (
              <Link key={e.id} to={`/clients/${c.id}/exercise/${e.id}`} className="row row-link">
                <span className="grow">
                  <strong>{e.name}</strong>
                  <span className="small">{e.group} · {fmtLog(e, logs[0])} on {fmtShort(logs[0].date)}</span>
                </span>
                {exCh && exCh.delta !== 0 && <span className={`pill ${exCh.good ? 'pill-paid' : 'pill-late'}`}>{exCh.text}</span>}
                <Icon name="chevron" size={16} />
              </Link>
            );
          })}
        </div>
      )}

      <div className="section-head"><h2>Goals</h2>{defs.length > 0 && <button className="link-btn" onClick={() => setAddingGoal(true)}>+ Add goal</button>}</div>
      {addingGoal && <GoalForm c={c} options={defs} onDone={() => setAddingGoal(false)} onSave={(g) => { save('goals', g); toast('Goal set'); }} />}
      {goals.length === 0 && !addingGoal && <Empty>{defs.length ? 'Set a target, like "mile under 7:00" or "body fat 15%", and track it here.' : 'Add a measurement or an exercise first, then set goals for it.'}</Empty>}
      {goals.map((g) => {
        const d = trackDef(g.metric, custom);
        if (!d) return null;
        const gp = pointsFor(g.metric);
        const pct = goalProgress(g, gp);
        return (
          <div className="card pad goal" key={g.id}>
            <div className="row-plain">
              <span className="grow"><strong>{d.label} → {fmtWith(d, g.target)}</strong>
                <span className="small">{gp.length ? `Now ${fmtWith(d, gp[gp.length - 1].value)}` : 'No data yet'}{g.byDate ? ` · by ${fmtLong(g.byDate)}` : ''}</span>
              </span>
              {pct === 1 && <span className="pill pill-paid">Reached</span>}
              <button className="icon-btn sm" aria-label="Delete goal" onClick={() => { if (confirm('Delete this goal?')) del('goals', g.id); }}><Icon name="trash" size={16} /></button>
            </div>
            {pct !== null && <div className="bar"><span style={{ width: `${Math.round(pct * 100)}%` }} /></div>}
          </div>
        );
      })}

      {defs.length > 0 && (c.phone
        ? <a className="btn btn-dark btn-block" href={smsHref(c.phone, shareText())}>Share progress with {c.firstName}</a>
        : <button className="btn btn-dark btn-block" onClick={() => toast('Add a phone number first')}>Share progress</button>)}

      {history.length > 0 && (
        <>
          <div className="section-head"><h2>Body measurement history</h2></div>
          <div className="card">
            {history.map((m) => (
              <Link key={m.id} to={`/clients/${c.id}/measure/${m.id}`} className="row row-link">
                <span className="grow">
                  <strong>{fmtLong(m.takenOn)}</strong>
                  <span className="small">{Object.entries(m.values).filter(([k]) => isMetric(k)).map(([k, v]) => `${metric(k as MetricKey).label} ${fmtValue(k as MetricKey, v as number)}`).join(' · ')}</span>
                </span>
                {m.fileId && <Icon name="file" size={16} />}
                <Icon name="chevron" size={16} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GoalForm({ c, options, onSave, onDone }: { c: Client; options: TrackDef[]; onSave: (g: Goal) => void; onDone: () => void }) {
  const [k, setK] = useState(options[0].key);
  const [target, setTarget] = useState('');
  const [by, setBy] = useState('');
  const def = options.find((o) => o.key === k) ?? options[0];
  return (
    <div className="card pad form-inline">
      <label>Goal for
        <select value={k} onChange={(e) => setK(e.target.value)}>
          {options.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
      </label>
      <div className="grid2">
        <label>Target {def.time ? '(m:ss)' : def.unit ? `(${def.unit})` : ''}<input inputMode={def.time ? 'text' : 'decimal'} value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        <label>By (optional)<input type="date" value={by} onChange={(e) => setBy(e.target.value)} /></label>
      </div>
      <div className="grid2">
        <button className="btn btn-outline" onClick={onDone}>Cancel</button>
        <button className="btn" onClick={() => {
          const v = parseWith(def, target);
          if (v === null) return;
          onSave({ id: uid(), clientId: c.id, metric: def.key, target: v, byDate: by || null, createdAt: nowIso() });
          onDone();
        }}>Save goal</button>
      </div>
    </div>
  );
}

const FILE_KINDS: [FileKind, string][] = [
  ['id', 'Photo ID'], ['parq', 'PAR-Q'], ['medical', 'Medical history'], ['waiver', 'Waiver'],
  ['scan', 'Body scan report'], ['photo', 'Progress photo'], ['other', 'Other'],
];

function FilesTab({ c }: { c: Client }) {
  const { snap, repo, save, toast, reload } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<FileKind>('id');
  const [busy, setBusy] = useState(false);
  const files = snap.files.filter((f) => f.clientId === c.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const intake = snap.intakes.filter((i) => i.clientId === c.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  const pick = (k: FileKind) => { setKind(k); input.current?.click(); };
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(list)) await repo.uploadFile(c.id, kind, f);
      await reload();
      toast('Uploaded');
    } catch (e) {
      toast(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const open = async (f: ClientFile) => {
    // Open the window synchronously so Safari doesn't block it as a popup.
    const w = window.open('', '_blank');
    try {
      const url = await repo.fileUrl(f);
      if (w) w.location.href = url; else location.href = url;
    } catch (e) {
      w?.close();
      toast((e as Error).message);
    }
  };
  const remove = async (f: ClientFile) => {
    if (!confirm(`Delete ${f.name}?`)) return;
    await repo.deleteFile(f);
    await reload();
    toast('File deleted');
  };

  const sendIntake = async () => {
    const token = uid().replace(/-/g, '');
    await save('intakes', { id: uid(), clientId: c.id, token, createdAt: nowIso(), completedAt: null, answers: null });
    const conn = getConnection();
    const link = `${location.origin}${location.pathname}#/intake/${token}${conn ? `?api=${encodeURIComponent(conn.api)}` : ''}`;
    const body = `Hi ${c.firstName}, please fill out your ${snap.settings.businessName} intake form before our next session (health questions, medical history, ID and waiver). It takes about 5 minutes: ${link}`;
    if (c.phone) location.href = smsHref(c.phone, body);
    else { await navigator.clipboard?.writeText(link); toast('Link copied. Add a phone number to text it.'); }
  };

  return (
    <div className="stack">
      <div className="card pad">
        <div className="row-plain">
          <span className="grow">
            <strong>Intake packet</strong>
            <span className="small">
              {!intake ? 'Not sent yet' : intake.completedAt ? `Completed ${fmtLong(intake.completedAt.slice(0, 10))}` : `Sent ${fmtShort(intake.createdAt.slice(0, 10))}, waiting on ${c.firstName}`}
            </span>
          </span>
          <button className="btn-sm" onClick={sendIntake}>{intake ? 'Resend' : 'Send'}</button>
        </div>
        {intake?.answers && (
          <div className="parq">
            {intake.answers.parq.some(Boolean)
              ? <p className="warn-text"><Icon name="alert" size={16} /> Answered "Yes" to {intake.answers.parq.filter(Boolean).length} PAR-Q question(s). Get the PAR-Q+ follow-up pages or a doctor's clearance before training hard.</p>
              : <p className="ok"><Icon name="check" size={16} /> All PAR-Q answers "No"</p>}
            {PARQ_QUESTIONS.map((q, i) => intake.answers!.parq[i] && <p className="small" key={i}>Yes: {q}</p>)}
            <p className="small">Signed by {intake.answers.signature} on {fmtLong(intake.answers.signedAt.slice(0, 10))}</p>
          </div>
        )}
      </div>

      <input ref={input} type="file" hidden accept="image/*,application/pdf" multiple onChange={(e) => upload(e.target.files)} />
      <div className="card">
        {FILE_KINDS.map(([k, label]) => {
          const mine = files.filter((f) => f.kind === k);
          return (
            <div key={k}>
              <div className="row">
                <span className="file-icon"><Icon name="file" size={18} /></span>
                <span className="grow"><strong>{label}</strong><span className="small">{mine.length ? `${mine.length} file${mine.length > 1 ? 's' : ''}` : 'Nothing uploaded'}</span></span>
                <button className="btn-sm btn-outline" disabled={busy} onClick={() => pick(k)}><Icon name="upload" size={14} /> Add</button>
              </div>
              {mine.map((f) => (
                <div className="row sub-row" key={f.id}>
                  <button className="row-main" onClick={() => open(f)}><span>{f.name}</span><span className="small">{fmtShort(f.createdAt.slice(0, 10))} · {Math.max(1, Math.round(f.size / 1024))} KB</span></button>
                  <button className="icon-btn sm" aria-label={`Delete ${f.name}`} onClick={() => remove(f)}><Icon name="trash" size={16} /></button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="small">{repo.mode === 'sheets' ? 'Files are saved in a private folder in your Google Drive. Only you can open them.' : repo.mode === 'cloud' ? 'Files are stored encrypted in a private bucket. Only you can open them, through links that expire after 2 minutes.' : 'Demo mode: files stay on this device only.'}</p>
    </div>
  );
}
