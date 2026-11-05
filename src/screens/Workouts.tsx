import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Client, ExerciseLog, Session, Workout, WorkoutItem } from '@shared/types.ts';
import { fmtDay, fmtLong, fmtShort } from '@shared/dates.ts';
import { fmtWith, parseWith } from '@shared/metrics.ts';
import { exerciseDef, findExercise, fmtLog, KINDS } from '@shared/exercises.ts';
import { useStore } from '../data/store';
import { nowIso, uid } from '../data/repo';
import { Empty, Header } from '../components/ui';
import { Icon } from '../components/Icon';
import { ExerciseLibrary } from './Exercises';
import { ClientProgramCard, ProgramsSection } from './Programs';
import { byName, fullName } from '../lib/util';

const PLAN_HINT = { weight: '3 × 8–10', reps: '3 × 10–12', hold: '3 sets', time: '1 mile' } as const;
const TARGET_LABEL = { weight: 'Weight lb', reps: 'Target reps', hold: 'Hold m:ss', time: 'Time m:ss' } as const;

/** The client's most recent logged numbers for an exercise. */
export function lastLog(logs: ExerciseLog[], clientId: string, exerciseId: string, before?: string): ExerciseLog | undefined {
  return logs
    .filter((l) => l.clientId === clientId && l.exerciseId === exerciseId && (!before || l.date <= before))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1))[0];
}

/** Copies a workout's exercises for one client. Each target starts from that client's
 *  last numbers for the exercise, falling back to the workout's own default. */
export function itemsForClient(items: WorkoutItem[], clientId: string, logs: ExerciseLog[]): WorkoutItem[] {
  return items.map((i) => ({
    id: uid(), exerciseId: i.exerciseId, plan: i.plan, done: false, value: null, reps: null, logId: null,
    target: lastLog(logs, clientId, i.exerciseId)?.value ?? i.target ?? null,
  }));
}

export function newSession(clientId: string, date: string, name: string, items: WorkoutItem[], workoutId: string | null, logs: ExerciseLog[]): Session {
  return { id: uid(), clientId, date, name, items: itemsForClient(items, clientId, logs), workoutId, completedAt: null, note: null, createdAt: nowIso() };
}

const doneCount = (s: Session) => s.items.filter((i) => i.done).length;

/** Client profile → Workouts tab. */
export function WorkoutsTab({ c }: { c: Client }) {
  const { snap, today } = useStore();
  const [starting, setStarting] = useState(false);
  const sessions = snap.sessions.filter((s) => s.clientId === c.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
  const todays = sessions.filter((s) => s.date === today);
  const past = sessions.filter((s) => s.date !== today);

  return (
    <div className="stack">
      <ClientProgramCard c={c} />
      {todays.map((s) => (
        <Link key={s.id} to={`/clients/${c.id}/workout/${s.id}`} className="card pad today-workout">
          <span className="eyebrow">Today{s.completedAt ? ' · done' : ''}</span>
          <strong className="display-sm">{s.name}</strong>
          <span className="small">{doneCount(s)} of {s.items.length} exercises done</span>
          <div className="bar"><span style={{ width: `${s.items.length ? Math.round((doneCount(s) / s.items.length) * 100) : 0}%` }} /></div>
        </Link>
      ))}
      <button className="btn btn-block btn-lg" onClick={() => setStarting(true)}><Icon name="plus" size={18} /> {todays.length ? 'Start another workout' : `Start today's workout`}</button>

      <div className="section-head"><h2>Past workouts</h2><Link className="link-btn" to="/workouts">Workout library</Link></div>
      {past.length === 0 ? <Empty>No past workouts yet. Workouts you build for {c.firstName} show up here, ready to repeat.</Empty> : (
        <div className="card">
          {past.map((s) => (
            <Link key={s.id} to={`/clients/${c.id}/workout/${s.id}`} className="row row-link">
              <span className="grow">
                <strong>{s.name}</strong>
                <span className="small">{fmtDay(s.date)} · {doneCount(s)} of {s.items.length} done{s.completedAt ? '' : ' · not finished'}</span>
              </span>
              <Icon name="chevron" size={16} />
            </Link>
          ))}
        </div>
      )}
      {starting && <StartSheet c={c} onClose={() => setStarting(false)} />}
    </div>
  );
}

/** Start a session for a client: blank, from the library, or repeat their last one. */
function StartSheet({ c, onClose }: { c: Client; onClose: () => void }) {
  const { snap, save, today } = useStore();
  const nav = useNavigate();
  const last = snap.sessions.filter((s) => s.clientId === c.id && s.items.length).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const start = (name: string, items: WorkoutItem[], workoutId: string | null) => {
    const s = newSession(c.id, today, name, items, workoutId, snap.exerciseLogs);
    save('sessions', s);
    nav(`/clients/${c.id}/workout/${s.id}`);
  };
  const library = [...snap.workouts].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Start a workout" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><strong>Workout for {c.firstName}</strong><span className="small">{fmtDay(today)}</span></div>
        <button className="reply" onClick={() => start('Workout', [], null)}>
          <strong>Build from scratch</strong>
          <span>Start empty and add exercises.</span>
        </button>
        {last && (
          <button className="reply" onClick={() => start(last.name, last.items, last.workoutId)}>
            <strong>Repeat last workout: {last.name}</strong>
            <span>{fmtShort(last.date)} · {last.items.length} exercises</span>
          </button>
        )}
        <span className="small upper">From your library</span>
        {library.length === 0 && <p className="small">No saved workouts yet. Build one, then tap "Save to workout library" to reuse it.</p>}
        {library.map((w) => (
          <button key={w.id} className="reply" onClick={() => start(w.name, w.items, w.id)}>
            <strong>{w.name}</strong>
            <span>{itemNames(w.items, snap.exercises)}</span>
          </button>
        ))}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function itemNames(items: WorkoutItem[], custom: Parameters<typeof findExercise>[1]): string {
  const names = items.map((i) => findExercise(i.exerciseId, custom)?.name).filter(Boolean);
  return names.length ? `${names.length} exercises: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}` : 'No exercises';
}

/** Saves `value` shortly after it stops changing, and on leaving the screen. */
export function useAutosave<T>(value: T, persist: (v: T) => void, ms = 700) {
  const latest = useRef(value);
  const pending = useRef(false);
  const first = useRef(true);
  useEffect(() => {
    latest.current = value;
    if (first.current) { first.current = false; return; }
    pending.current = true;
    const t = setTimeout(() => { pending.current = false; persist(value); }, ms);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (pending.current) persist(latest.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** One client's workout for one day: check off exercises, enter results, finish, save to library. */
export function SessionScreen() {
  const { id, sid } = useParams();
  const { snap, client, save, del, toast, today } = useStore();
  const nav = useNavigate();
  const c = client(id!);
  const stored = snap.sessions.find((s) => s.id === sid);
  const [s, setS] = useState<Session | undefined>(stored);
  const [adding, setAdding] = useState(false);
  useAutosave(s, (v) => v && save('sessions', v));
  if (!c || !s) return <div className="page"><Header title="Workout not found" back /></div>;

  const set = (patch: Partial<Session>) => setS({ ...s, ...patch });
  const template = s.workoutId ? snap.workouts.find((w) => w.id === s.workoutId) : undefined;

  const finish = () => {
    // Results become exercise logs, so they show up on Progress charts and personal bests.
    const items = s.items.map((i) => {
      const e = findExercise(i.exerciseId, snap.exercises);
      if (e && i.done && i.value) {
        const logId = i.logId ?? uid();
        save('exerciseLogs', { id: logId, clientId: c.id, exerciseId: i.exerciseId, date: s.date, value: i.value, reps: e.kind === 'weight' ? i.reps ?? null : null, note: s.name, createdAt: nowIso() });
        return { ...i, logId };
      }
      if (i.logId) del('exerciseLogs', i.logId);
      return { ...i, logId: null };
    });
    const next = { ...s, items, completedAt: s.completedAt ?? nowIso() };
    setS(next);
    save('sessions', next);
    const logged = items.filter((i) => i.logId).length;
    toast(s.completedAt ? 'Results updated' : `Workout finished${logged ? `. ${logged} result${logged === 1 ? '' : 's'} added to ${c.firstName}'s progress` : ''}`);
  };

  const saveToLibrary = (asNew: boolean) => {
    if (!s.items.length) return toast('Add exercises first');
    const name = asNew ? prompt('Name this workout', s.name === 'Workout' ? '' : s.name)?.trim() : template!.name;
    if (!name) return;
    const items = s.items.map((i) => ({ id: uid(), exerciseId: i.exerciseId, plan: i.plan, target: i.target ?? null }));
    const w: Workout = asNew || !template ? { id: uid(), name, items, createdAt: nowIso(), updatedAt: nowIso() } : { ...template, items, updatedAt: nowIso() };
    save('workouts', w);
    set({ workoutId: w.id, name });
    toast(asNew ? `"${name}" saved to your workout library` : `"${name}" updated in your library`);
  };

  const repeatToday = () => {
    const n = newSession(c.id, today, s.name, s.items, s.workoutId, snap.exerciseLogs);
    save('sessions', n);
    nav(`/clients/${c.id}/workout/${n.id}`, { replace: true });
    setS(n);
  };

  const remove = () => {
    if (!confirm('Delete this workout? Results already added to progress stay there.')) return;
    del('sessions', s.id);
    nav(`/clients/${c.id}?tab=workouts`, { replace: true });
  };

  return (
    <div className="page form">
      <Header title="" back />
      <input className="title-input" aria-label="Workout name" value={s.name} onChange={(e) => set({ name: e.target.value })} />
      <div className="row-plain">
        <span className="grow small">{fullName(c)} · {doneCount(s)} of {s.items.length} done{s.completedAt ? ' · finished' : ''}</span>
        <input className="inline-select" type="date" aria-label="Workout date" value={s.date} max={today} onChange={(e) => set({ date: e.target.value || s.date })} />
      </div>

      <ItemsEditor items={s.items} onChange={(items) => set({ items })} mode="session" clientId={c.id} date={s.date} />
      <button className="btn btn-outline btn-block" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add exercise</button>

      <label>Notes<textarea rows={2} value={s.note ?? ''} placeholder="How did it go?" onChange={(e) => set({ note: e.target.value || null })} /></label>

      <button className="btn btn-block btn-lg" onClick={finish} disabled={!s.items.length}>{s.completedAt ? 'Update results' : 'Finish workout'}</button>
      <p className="small">Check off each exercise and enter what {c.firstName} did. Finishing adds the results to {c.firstName}'s Progress charts.</p>

      <div className="grid2">
        {template ? <button className="btn btn-outline" onClick={() => saveToLibrary(false)}>Update "{template.name}"</button> : null}
        <button className={`btn btn-outline${template ? '' : ' span2'}`} onClick={() => saveToLibrary(true)}>{template ? 'Save as new workout' : 'Save to workout library'}</button>
      </div>
      {s.date < today && <button className="btn btn-dark btn-block" onClick={repeatToday}>Repeat this workout today</button>}
      <button className="btn-ghost danger" onClick={remove}>Delete workout</button>

      {adding && <AddExerciseSheet onClose={() => setAdding(false)} onPick={(exerciseId) => { set({ items: [...s.items, { id: uid(), exerciseId, plan: '', done: false, value: null, reps: null, logId: null, target: lastLog(snap.exerciseLogs, c.id, exerciseId)?.value ?? null }] }); setAdding(false); }} />}
    </div>
  );
}

export function AddExerciseSheet({ onPick, onClose }: { onPick: (exerciseId: string) => void; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet-tall" role="dialog" aria-label="Add exercise" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><strong>Add exercise</strong><button className="btn-ghost" onClick={onClose}>Close</button></div>
        <ExerciseLibrary onPick={(e) => onPick(e.id)} />
      </div>
    </div>
  );
}

/** The exercise list of a session (check off + results) or a library workout.
 *  Each exercise has a plan (sets × rep range) and a target (weight, reps or time). */
function ItemsEditor({ items, onChange, mode, clientId, date }: { items: WorkoutItem[]; onChange: (items: WorkoutItem[]) => void; mode: 'session' | 'template'; clientId?: string; date?: string }) {
  const { snap } = useStore();
  const update = (id: string, patch: Partial<WorkoutItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const move = (idx: number) => { const next = [...items]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; onChange(next); };
  if (!items.length) return <Empty>No exercises yet. Tap "Add exercise" to pick from the library.</Empty>;

  return (
    <div className="card">
      {items.map((i, idx) => {
        const e = findExercise(i.exerciseId, snap.exercises);
        if (!e) return null;
        const last = clientId ? lastLog(snap.exerciseLogs, clientId, e.id, date) : undefined;
        const toggle = () => update(i.id, { done: !i.done, value: !i.done && i.value == null ? i.target ?? null : i.value });
        return (
          <div className={`wk-item${i.done ? ' wk-done' : ''}`} key={i.id}>
            {mode === 'session' && (
              <button type="button" className="wk-check" aria-pressed={!!i.done} aria-label={`${e.name} done`} onClick={toggle}>
                {i.done && <Icon name="check" size={18} stroke={3} />}
              </button>
            )}
            <div className="grow">
              <strong>{e.name}</strong>
              <div className="wk-plan-row">
                <input className="wk-plan" aria-label={`${e.name} sets and reps`} placeholder={`Sets × reps, e.g. ${PLAN_HINT[e.kind]}`} value={i.plan} onChange={(ev) => update(i.id, { plan: ev.target.value })} />
                <NumberInput kind={e.kind} value={i.target ?? null} label={`${e.name} ${mode === 'template' ? 'default' : 'target'}`} placeholder={TARGET_LABEL[e.kind]} onChange={(v) => update(i.id, { target: v })} />
              </div>
              {mode === 'session' && (
                last ? (
                  <span className="wk-last small">
                    Last: {fmtLog(e, last)} · {fmtShort(last.date)}
                    {last.value !== i.target && <button type="button" className="link-btn sm" onClick={() => update(i.id, { target: last.value })}>Use</button>}
                  </span>
                ) : <span className="wk-last small">First time doing this. Set a starting {e.kind === 'weight' ? 'weight' : 'target'}.</span>
              )}
              {mode === 'session' && i.done && <ResultInputs item={i} kind={e.kind} onChange={(patch) => update(i.id, patch)} />}
            </div>
            <div className="wk-tools">
              {idx > 0 && <button type="button" className="icon-btn sm" aria-label={`Move ${e.name} up`} onClick={() => move(idx)}><Icon name="up" size={16} /></button>}
              <button type="button" className="icon-btn sm" aria-label={`Remove ${e.name}`} onClick={() => onChange(items.filter((x) => x.id !== i.id))}><Icon name="x" size={16} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A number box that understands m:ss for timed exercises. */
function NumberInput({ kind, value, label, placeholder, onChange }: { kind: keyof typeof KINDS; value: number | null; label: string; placeholder: string; onChange: (v: number | null) => void }) {
  const def = exerciseDef({ id: '', name: '', group: '', kind, createdAt: '' });
  const show = (v: number | null) => (v ? fmtWith(def, v).replace(/ (lb|reps)$/, '') : '');
  const [raw, setRaw] = useState(show(value));
  // Follow outside changes (e.g. "Use" last numbers) without fighting what's being typed.
  useEffect(() => { if (parseWith(def, raw) !== value) setRaw(show(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className="wk-target" aria-label={label} placeholder={placeholder} inputMode={KINDS[kind].time ? 'text' : 'decimal'} value={raw}
      onChange={(ev) => { setRaw(ev.target.value); onChange(parseWith(def, ev.target.value)); }} />
  );
}

function ResultInputs({ item, kind, onChange }: { item: WorkoutItem; kind: keyof typeof KINDS; onChange: (p: Partial<WorkoutItem>) => void }) {
  const label = kind === 'weight' ? 'Did (lb)' : kind === 'reps' ? 'Did (reps)' : 'Did (m:ss)';
  return (
    <div className="wk-result">
      <label>{label}
        <NumberInput kind={kind} value={item.value ?? null} label={`${label} result`} placeholder="" onChange={(v) => onChange({ value: v })} />
      </label>
      {kind === 'weight' && (
        <label>Reps<input inputMode="numeric" value={item.reps ?? ''} onChange={(e) => onChange({ reps: Number(e.target.value) || null })} /></label>
      )}
    </div>
  );
}

/** Library of reusable workouts. */
export function WorkoutLibrary() {
  const { snap, save } = useStore();
  const nav = useNavigate();
  const list = [...snap.workouts].sort((a, b) => a.name.localeCompare(b.name));
  const create = () => {
    const w: Workout = { id: uid(), name: 'New workout', items: [], createdAt: nowIso(), updatedAt: nowIso() };
    save('workouts', w);
    nav(`/workouts/${w.id}`);
  };
  return (
    <div className="page">
      <Header title="Workouts & programs" sub="Reusable workouts and 8-week programs for any client" back />
      <ProgramsSection />
      <div className="section-head"><h2>Workouts</h2><button className="link-btn" onClick={create}>+ New workout</button></div>
      {list.length === 0 && <Empty>No saved workouts yet. Tap "New" to build one, or save any client's workout to the library.</Empty>}
      <div className="stack">
        {list.map((w) => (
          <Link key={w.id} to={`/workouts/${w.id}`} className="card row row-link">
            <span className="grow"><strong>{w.name}</strong><span className="small">{itemNames(w.items, snap.exercises)}</span></span>
            <Icon name="chevron" size={16} />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Edit a library workout, or assign it to a client for today. */
export function WorkoutTemplate() {
  const { wid } = useParams();
  const { snap, save, del, toast, today } = useStore();
  const nav = useNavigate();
  const stored = snap.workouts.find((w) => w.id === wid);
  const [w, setW] = useState<Workout | undefined>(stored);
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);
  useAutosave(w, (v) => v && save('workouts', { ...v, updatedAt: nowIso() }));
  if (!w) return <div className="page"><Header title="Workout not found" back /></div>;
  const clients = snap.clients.filter((c) => c.active).sort(byName);

  const assign = (c: Client) => {
    const s = newSession(c.id, today, w.name, w.items, w.id, snap.exerciseLogs);
    save('sessions', s);
    nav(`/clients/${c.id}/workout/${s.id}`);
  };

  return (
    <div className="page form">
      <Header title="" back />
      <input className="title-input" aria-label="Workout name" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} />
      <p className="small">Saved automatically. {w.items.length} exercise{w.items.length === 1 ? '' : 's'}.</p>
      <ItemsEditor items={w.items} onChange={(items) => setW({ ...w, items })} mode="template" />
      <button className="btn btn-outline btn-block" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add exercise</button>
      <button className="btn btn-block btn-lg" disabled={!w.items.length} onClick={() => setAssigning(true)}>Use for a client today</button>
      <button className="btn-ghost danger" onClick={() => { if (confirm(`Delete "${w.name}" from your library? Past client workouts stay.`)) { del('workouts', w.id); toast('Deleted'); nav('/workouts', { replace: true }); } }}>Delete workout</button>

      {adding && <AddExerciseSheet onClose={() => setAdding(false)} onPick={(exerciseId) => { setW({ ...w, items: [...w.items, { id: uid(), exerciseId, plan: '' }] }); setAdding(false); }} />}
      {assigning && (
        <div className="sheet-backdrop" onClick={() => setAssigning(false)}>
          <div className="sheet" role="dialog" aria-label="Choose client" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><strong>Which client?</strong><span className="small">{fmtLong(today)}</span></div>
            {clients.length === 0 && <p className="muted">Add a client first.</p>}
            <div className="card">
              {clients.map((c) => (
                <button key={c.id} className="row row-link text-left" onClick={() => assign(c)}>
                  <span className="grow"><strong>{fullName(c)}</strong></span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => setAssigning(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

