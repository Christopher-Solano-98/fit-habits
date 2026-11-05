import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Exercise, ExerciseKind } from '@shared/types.ts';
import { fmtLong, fmtShort } from '@shared/dates.ts';
import { changeWith, fmtWith, parseWith } from '@shared/metrics.ts';
import { allExercises, EXERCISE_GROUPS, exerciseDef, exerciseSeries, exKey, findExercise, fmtLog, KINDS } from '@shared/exercises.ts';
import { useStore } from '../data/store';
import { nowIso, uid } from '../data/repo';
import { Empty, Header, Seg } from '../components/ui';
import { Icon } from '../components/Icon';
import { LineChart } from '../components/LineChart';

/** Pick an exercise to start tracking for a client. */
export function ExercisePicker() {
  const { id } = useParams();
  const { client, snap } = useStore();
  const nav = useNavigate();
  const c = client(id!);
  if (!c) return null;
  const tracking = new Set(snap.exerciseLogs.filter((l) => l.clientId === c.id).map((l) => l.exerciseId));
  return (
    <div className="page">
      <Header title="Add exercise" sub={`for ${c.firstName} ${c.lastName}`} back />
      <ExerciseLibrary marked={tracking} markLabel="Tracking" onPick={(e) => nav(`/clients/${c.id}/exercise/${e.id}`, { replace: true })} />
    </div>
  );
}

/** The exercise library by body part, with search and "create your own". Used by the picker and the workout builder. */
export function ExerciseLibrary({ onPick, marked, markLabel }: { onPick: (e: Exercise) => void; marked?: Set<string>; markLabel?: string }) {
  const { snap } = useStore();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const all = allExercises(snap.exercises);
  const term = q.trim().toLowerCase();
  const match = (e: Exercise) => !term || e.name.toLowerCase().includes(term) || e.group.toLowerCase().includes(term);
  const groups = [...EXERCISE_GROUPS, ...new Set(snap.exercises.map((e) => e.group).filter((g) => !(EXERCISE_GROUPS as readonly string[]).includes(g)))];

  return (
    <>
      <label className="search">
        <Icon name="search" size={16} />
        <span className="sr">Search exercises</span>
        <input type="search" placeholder="Search, e.g. squat, pull-ups, mile" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <button className="btn btn-outline btn-block" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Create your own exercise</button>

      {groups.map((g) => {
        const list = all.filter((e) => e.group === g && match(e));
        if (!list.length) return null;
        return (
          <section className="section" key={g}>
            <div className="section-head"><h2>{g}</h2></div>
            <div className="card">
              {list.map((e) => (
                <button key={e.id} className="row row-link text-left" onClick={() => onPick(e)}>
                  <span className="grow">
                    <strong>{e.name}{e.id.startsWith('b-') ? '' : ' ★'}</strong>
                    <span className="small">{KINDS[e.kind].label}</span>
                  </span>
                  {marked?.has(e.id) ? <span className="pill pill-paid">{markLabel}</span> : <Icon name="plus" size={18} />}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {term && !all.some(match) && <Empty>No exercise called "{q}". Tap "Create your own exercise" to add it.</Empty>}
      {creating && <CreateExercise initialName={q} onClose={() => setCreating(false)} onCreated={(e) => { setCreating(false); onPick(e); }} />}
    </>
  );
}

function CreateExercise({ initialName, onClose, onCreated }: { initialName: string; onClose: () => void; onCreated: (e: Exercise) => void }) {
  const { save, toast } = useStore();
  const [name, setName] = useState(initialName);
  const [group, setGroup] = useState<string>('Chest');
  const [kind, setKind] = useState<ExerciseKind>('weight');
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!name.trim()) return;
    const e: Exercise = { id: uid(), name: name.trim(), group, kind, createdAt: nowIso() };
    save('exercises', e);
    toast(`${e.name} added to your library`);
    onCreated(e);
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet form" role="dialog" aria-label="Create exercise" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <strong>New exercise</strong>
        <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sled push" /></label>
        <label>Body part
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {EXERCISE_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label>How it's measured</label>
        <Seg<ExerciseKind> value={kind} options={[['weight', 'Weight'], ['reps', 'Reps'], ['hold', 'Hold'], ['time', 'Time']]} onChange={setKind} />
        <span className="small">{KINDS[kind].hint}{kind === 'time' ? '. Lower is better, like a mile.' : '.'}</span>
        <button className="btn btn-block" type="submit" disabled={!name.trim()}>Add exercise</button>
        <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}

/** One exercise for one client: log today's numbers, see the chart and every entry. */
export function ExerciseDetail() {
  const { id, exId } = useParams();
  const { client, snap, save, del, toast, today } = useStore();
  const c = client(id!);
  const e = findExercise(exId!, snap.exercises);
  const [date, setDate] = useState(today);
  const [value, setValue] = useState('');
  const [reps, setReps] = useState('');
  if (!c || !e) return <div className="page"><Header title="Exercise not found" back /></div>;

  const def = exerciseDef(e);
  const kind = KINDS[e.kind];
  const logs = snap.exerciseLogs.filter((l) => l.clientId === c.id && l.exerciseId === e.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
  const pts = exerciseSeries(snap.exerciseLogs, c.id, e.id);
  const ch = changeWith(def, pts);
  const goal = snap.goals.find((g) => g.clientId === c.id && g.metric === exKey(e.id));
  const best = pts.length ? pts.reduce((a, p) => (kind.better === 'up' ? (p.value > a.value ? p : a) : (p.value < a.value ? p : a))) : null;

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const v = parseWith(def, value);
    if (v === null || v <= 0) return toast(kind.time ? 'Enter a time like 7:42' : 'Enter a number');
    const r = e.kind === 'weight' && reps.trim() ? Math.round(Number(reps)) : null;
    save('exerciseLogs', { id: uid(), clientId: c.id, exerciseId: e.id, date, value: v, reps: r && r > 0 ? r : null, note: null, createdAt: nowIso() });
    const isBest = !best || (kind.better === 'up' ? v > best.value : v < best.value);
    toast(isBest && best ? `New personal best for ${c.firstName}!` : 'Logged');
    setValue('');
    setReps('');
  };

  return (
    <div className="page">
      <Header title={e.name} sub={<>{c.firstName} {c.lastName} · {e.group} · {kind.label}</>} back />

      <form className="card pad form-inline form" onSubmit={submit}>
        <strong>Log {fmtShort(date) === fmtShort(today) ? "today's" : fmtShort(date)} numbers</strong>
        <div className={e.kind === 'weight' ? 'grid3' : 'grid2'}>
          <label>{e.kind === 'weight' ? 'Weight (lb)' : e.kind === 'reps' ? 'Reps' : 'Time (m:ss)'}
            <input inputMode={kind.time ? 'text' : 'decimal'} placeholder={kind.time ? '1:30' : ''} value={value} onChange={(ev) => setValue(ev.target.value)} />
          </label>
          {e.kind === 'weight' && <label>Reps<input inputMode="numeric" value={reps} onChange={(ev) => setReps(ev.target.value)} /></label>}
          <label>Date<input type="date" value={date} max={today} onChange={(ev) => setDate(ev.target.value || today)} /></label>
        </div>
        <button className="btn btn-block" type="submit">Log it</button>
      </form>

      {pts.length > 0 ? (
        <div className="card pad">
          <div className="chart-head">
            <div>
              <span className="small">Personal best</span>
              <div className="big-num">{fmtWith(def, best!.value)}</div>
            </div>
            {ch && ch.delta !== 0 && <span className={`pill ${ch.good ? 'pill-paid' : 'pill-late'}`}>{ch.text}</span>}
          </div>
          <LineChart def={def} points={pts} target={goal?.target} />
          {ch && <p className="small">On {fmtLong(ch.first.date)}: {fmtWith(def, ch.first.value)}. Latest ({fmtLong(ch.last.date)}): {fmtWith(def, ch.last.value)}.</p>}
          {goal && <p className="small">Goal: {fmtWith(def, goal.target)}{goal.byDate ? ` by ${fmtLong(goal.byDate)}` : ''}. Set goals on the Progress tab.</p>}
        </div>
      ) : (
        <Empty>No entries yet. Log {c.firstName}'s first numbers above to start the chart.</Empty>
      )}

      {logs.length > 0 && (
        <>
          <div className="section-head"><h2>History</h2></div>
          <div className="card">
            {logs.map((l) => (
              <div className="row" key={l.id}>
                <span className="grow"><strong>{fmtLog(e, l)}</strong><span className="small">{fmtLong(l.date)}</span></span>
                <button className="icon-btn sm" aria-label="Delete entry" onClick={() => { if (confirm(`Delete ${fmtLog(e, l)} from ${fmtShort(l.date)}?`)) del('exerciseLogs', l.id); }}><Icon name="trash" size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      <Link className="btn btn-outline btn-block" to={`/clients/${c.id}?tab=progress`}>Back to {c.firstName}'s progress</Link>
    </div>
  );
}
