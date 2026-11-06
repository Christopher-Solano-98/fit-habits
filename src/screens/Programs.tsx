import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Client, Program, ProgramDay } from '@shared/types.ts';
import { fmtLong, fmtShort, todayIso } from '@shared/dates.ts';
import { findExercise } from '@shared/exercises.ts';
import { DEFAULT_PHASES, howToUrl, phaseDates, phaseWeeksLabel, programPosition, totalWeeks } from '@shared/programs.ts';
import { mailtoHref, smsHref } from '@shared/messages.ts';
import { useStore } from '../data/store';
import { nowIso, uid } from '../data/repo';
import { Empty, Header } from '../components/ui';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';
import { AddExerciseSheet, newSession, useAutosave } from './Workouts';
import { decodePlan, encodePlan, type PlanPayload } from '../lib/planLink';
import { byName, fullName } from '../lib/util';

function blankProgram(clientId: string | null, startDate: string | null): Program {
  return {
    id: uid(), name: '8-week program', clientId, phaseWeeks: 2, phases: DEFAULT_PHASES.map((p) => ({ ...p })), startDate,
    days: [{ id: uid(), name: 'Day 1', items: [] }], createdAt: nowIso(), updatedAt: nowIso(),
  };
}

/** A copy with fresh ids, e.g. a library program assigned to a client. */
function copyProgram(p: Program, clientId: string | null, startDate: string | null, name = p.name): Program {
  return {
    ...p, id: uid(), name, clientId, startDate, createdAt: nowIso(), updatedAt: nowIso(),
    phases: p.phases.map((x) => ({ ...x })),
    days: p.days.map((d) => ({ id: uid(), name: d.name, items: d.items.map((i) => ({ id: uid(), exerciseId: i.exerciseId, plans: [...i.plans] })) })),
  };
}

function positionText(p: Program, today: string): string {
  const pos = programPosition(p, today);
  if (pos.status === 'upcoming') return p.startDate ? `Starts ${fmtShort(p.startDate)}` : 'Not started';
  if (pos.status === 'done') return `Finished (${totalWeeks(p)} weeks)`;
  return `Week ${pos.week} of ${totalWeeks(p)} · ${p.phases[pos.phase]?.label ?? ''}`;
}

/** Library page section: reusable programs. */
export function ProgramsSection() {
  const { snap, save } = useStore();
  const nav = useNavigate();
  const list = snap.programs.filter((p) => !p.clientId).sort((a, b) => a.name.localeCompare(b.name));
  const create = () => { const p = blankProgram(null, null); save('programs', p); nav(`/programs/${p.id}`); };
  return (
    <section className="section">
      <div className="section-head"><h2>8-week programs</h2><button className="link-btn" onClick={create}>+ New program</button></div>
      {list.length === 0 ? <Empty>No programs yet. Build one with workout days and a plan for every 2-week phase, then assign it to any client.</Empty> : (
        <div className="card">
          {list.map((p) => (
            <Link key={p.id} to={`/programs/${p.id}`} className="row row-link">
              <span className="grow"><strong>{p.name}</strong><span className="small">{totalWeeks(p)} weeks · {p.days.length} workout day{p.days.length === 1 ? '' : 's'} · {p.phases.map((x) => x.label).join(' → ')}</span></span>
              <Icon name="chevron" size={16} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** Client profile → Workouts tab: their current program, with today's workout one tap away. */
export function ClientProgramCard({ c }: { c: Client }) {
  const { snap, save, today } = useStore();
  const nav = useNavigate();
  const [choosing, setChoosing] = useState(false);
  const program = snap.programs.filter((p) => p.clientId === c.id).sort((a, b) => ((a.startDate ?? '') < (b.startDate ?? '') ? 1 : -1))[0];
  const library = snap.programs.filter((p) => !p.clientId).sort((a, b) => a.name.localeCompare(b.name));

  const assign = (from: Program | null) => {
    const p = from ? copyProgram(from, c.id, today) : blankProgram(c.id, today);
    save('programs', p);
    nav(`/programs/${p.id}`);
  };

  const startDay = (p: Program, d: ProgramDay) => {
    const phase = programPosition(p, today).phase;
    const items = d.items.map((i) => ({ id: uid(), exerciseId: i.exerciseId, plan: i.plans[phase] ?? '' }));
    const s = newSession(c.id, today, `${p.name}: ${d.name}`, items, null, snap.exerciseLogs);
    save('sessions', s);
    nav(`/clients/${c.id}/workout/${s.id}`);
  };

  if (!program) {
    return (
      <>
        <button className="btn btn-outline btn-block" onClick={() => setChoosing(true)}><Icon name="calendar" size={16} /> Create an 8-week program</button>
        {choosing && (
          <div className="sheet-backdrop" onClick={() => setChoosing(false)}>
            <div className="sheet" role="dialog" aria-label="Create program" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head"><strong>Program for {c.firstName}</strong><span className="small">Starts today</span></div>
              <button className="reply" onClick={() => assign(null)}><strong>Build from scratch</strong><span>8 weeks, 4 phases of 2 weeks.</span></button>
              {library.length > 0 && <span className="small upper">From your library</span>}
              {library.map((p) => (
                <button key={p.id} className="reply" onClick={() => assign(p)}><strong>{p.name}</strong><span>{p.days.length} days · {p.phases.map((x) => x.label).join(' → ')}</span></button>
              ))}
              <button className="btn-ghost" onClick={() => setChoosing(false)}>Cancel</button>
            </div>
          </div>
        )}
      </>
    );
  }

  const pos = programPosition(program, today);
  return (
    <div className="card pad program-card">
      <span className="eyebrow">8-week program</span>
      <Link to={`/programs/${program.id}`} className="display-sm program-title">{program.name}</Link>
      <span className="small">{positionText(program, today)}</span>
      <div className="bar"><span style={{ width: `${Math.min(100, Math.round((Math.max(pos.week, 0) / totalWeeks(program)) * 100))}%` }} /></div>
      {pos.status === 'active' && program.days.length > 0 && (
        <div className="stack-sm">
          <span className="small">Start today's workout from {program.phases[pos.phase]?.label ?? 'this phase'}:</span>
          <div className="chips">
            {program.days.map((d) => <button key={d.id} className="chip chip-lg" onClick={() => startDay(program, d)}>{d.name}</button>)}
          </div>
        </div>
      )}
      <div className="grid2">
        <Link className="btn btn-outline" to={`/programs/${program.id}`}>Open program</Link>
        <SendPlanButton p={program} c={c} />
      </div>
    </div>
  );
}

async function planPayload(p: Program, c: Client | undefined, snap: ReturnType<typeof useStore>['snap']): Promise<string> {
  const payload: PlanPayload = {
    v: 1, b: snap.settings.businessName, t: snap.settings.trainerName, c: c?.firstName ?? '', n: p.name, s: p.startDate, w: p.phaseWeeks,
    ph: p.phases.map((x) => ({ l: x.label, no: x.note })),
    d: p.days.map((d) => ({
      n: d.name,
      i: d.items.map((i) => {
        const e = findExercise(i.exerciseId, snap.exercises);
        return { e: e?.name ?? 'Exercise', u: e ? howToUrl(e, snap.settings.exerciseLinks) : '', p: i.plans };
      }),
    })),
  };
  return encodePlan(payload);
}

export async function planUrl(p: Program, c: Client | undefined, snap: ReturnType<typeof useStore>['snap'], day?: number): Promise<string> {
  const data = await planPayload(p, c, snap);
  return `${location.origin}${location.pathname}#/plan/${data}${day !== undefined ? `?day=${day}` : ''}`;
}

function SendPlanButton({ p, c }: { p: Program; c: Client }) {
  const { snap, toast } = useStore();
  const send = async () => {
    const url = await planUrl(p, c, snap);
    const body = `Hi ${c.firstName}, here's your ${totalWeeks(p)}-week plan: ${p.name}. Tap any exercise for a how-to video. - ${snap.settings.trainerName}\n${url}`;
    if (c.phone && c.channel !== 'email') location.href = smsHref(c.phone, body);
    else if (c.email) location.href = mailtoHref(c.email, `Your ${totalWeeks(p)}-week plan`, body);
    else { await navigator.clipboard?.writeText(url); toast('Plan link copied'); }
  };
  return <button className="btn btn-dark" onClick={send}>Send to {c.firstName}</button>;
}

/** Build or edit a program: phases of 2 weeks, workout days, a plan per exercise per phase. */
export function ProgramEditor() {
  // Keyed by id so switching programs (e.g. after Assign) starts from that program's saved state.
  const { pid } = useParams();
  return <ProgramEditorFor key={pid} pid={pid!} />;
}

function ProgramEditorFor({ pid }: { pid: string }) {
  const { snap, save, del, saveSettings, toast, client, today } = useStore();
  const nav = useNavigate();
  const stored = snap.programs.find((p) => p.id === pid);
  const [p, setP] = useState<Program | undefined>(stored);
  const [ph, setPh] = useState(() => (stored ? programPosition(stored, today).phase : 0));
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  useAutosave(p, (v) => v && save('programs', { ...v, updatedAt: nowIso() }));
  if (!p) return <div className="page"><Header title="Program not found" back /></div>;
  const c = p.clientId ? client(p.clientId) : undefined;

  const set = (patch: Partial<Program>) => setP({ ...p, ...patch });
  const setDay = (id: string, patch: Partial<ProgramDay>) => set({ days: p.days.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  const setPlan = (dayId: string, itemId: string, value: string) =>
    setDay(dayId, { items: p.days.find((d) => d.id === dayId)!.items.map((i) => (i.id === itemId ? { ...i, plans: p.phases.map((_, k) => (k === ph ? value : i.plans[k] ?? '')) } : i)) });
  const copyPrev = () => set({ days: p.days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i, plans: p.phases.map((_, k) => (k === ph && !i.plans[k] ? i.plans[k - 1] ?? '' : i.plans[k] ?? '')) })) })) });
  const setLink = (exerciseId: string, name: string) => {
    const cur = snap.settings.exerciseLinks?.[exerciseId] ?? '';
    const v = prompt(`How-to video link for ${name} (YouTube, Instagram…). Leave empty to use a YouTube search.`, cur);
    if (v === null) return;
    const links = { ...(snap.settings.exerciseLinks ?? {}) };
    if (v.trim()) links[exerciseId] = v.trim(); else delete links[exerciseId];
    saveSettings({ ...snap.settings, exerciseLinks: links });
    toast(v.trim() ? `Video link saved for ${name}` : `${name} uses a YouTube search`);
  };
  const preview = async () => nav(`/plan/${(await planUrl(p, c, snap)).split('#/plan/')[1]}`);
  const saveToLibrary = () => {
    const name = prompt('Name for your program library', p.name)?.trim();
    if (!name) return;
    save('programs', copyProgram(p, null, null, name));
    toast(`"${name}" saved to your program library`);
  };

  return (
    <div className="page form">
      <Header title="" back help="programs" />
      <input className="title-input" aria-label="Program name" value={p.name} onChange={(e) => set({ name: e.target.value })} />
      <div className="row-plain">
        <span className="grow small">{c ? `${fullName(c)} · ${positionText(p, today)}` : `Library program · ${totalWeeks(p)} weeks`}</span>
        {c && <input className="inline-select" type="date" aria-label="Start date" value={p.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || p.startDate })} />}
      </div>

      <div className="phase-tabs" role="tablist">
        {p.phases.map((x, k) => (
          <button key={k} type="button" className={`phase-tab${k === ph ? ' on' : ''}`} aria-pressed={k === ph} onClick={() => setPh(k)}>
            <span>{phaseWeeksLabel(p, k)}</span>
            <strong>{x.label || `Phase ${k + 1}`}</strong>
          </button>
        ))}
      </div>
      <div className="card pad form-inline">
        <div className="grid2">
          <label>Phase name<input value={p.phases[ph].label} onChange={(e) => set({ phases: p.phases.map((x, k) => (k === ph ? { ...x, label: e.target.value } : x)) })} /></label>
          <label>Dates<input disabled value={phaseDates(p, ph) ?? 'Set when assigned'} /></label>
        </div>
        <label>Note for the client<input value={p.phases[ph].note} placeholder="e.g. Add 5 lb when you hit the top of the rep range" onChange={(e) => set({ phases: p.phases.map((x, k) => (k === ph ? { ...x, note: e.target.value } : x)) })} /></label>
        {ph > 0 && <button type="button" className="btn-sm btn-outline" onClick={copyPrev}>Fill empty plans from {phaseWeeksLabel(p, ph - 1)}</button>}
      </div>

      {p.days.map((d, di) => (
        <div className="card" key={d.id}>
          <div className="row">
            <input className="day-name" aria-label="Workout day name" value={d.name} onChange={(e) => setDay(d.id, { name: e.target.value })} />
            <button type="button" className="icon-btn sm" aria-label={`Remove ${d.name}`} onClick={() => { if (confirm(`Remove ${d.name}?`)) set({ days: p.days.filter((x) => x.id !== d.id) }); }}><Icon name="trash" size={16} /></button>
          </div>
          {d.items.map((i) => {
            const e = findExercise(i.exerciseId, snap.exercises);
            if (!e) return null;
            const own = !!snap.settings.exerciseLinks?.[e.id];
            return (
              <div className="wk-item" key={i.id}>
                <div className="grow">
                  <span className="row-plain">
                    <strong className="grow">{e.name}</strong>
                    <button type="button" className={`link-btn sm${own ? '' : ' muted-link'}`} onClick={() => setLink(e.id, e.name)}><Icon name="link" size={14} /> {own ? 'Video' : 'Add video'}</button>
                  </span>
                  <input className="wk-plan" aria-label={`${e.name} plan for ${phaseWeeksLabel(p, ph)}`} placeholder={ph > 0 && i.plans[ph - 1] ? `Last phase: ${i.plans[ph - 1]}` : 'e.g. 3 × 10 @ 95 lb'} value={i.plans[ph] ?? ''} onChange={(ev) => setPlan(d.id, i.id, ev.target.value)} />
                </div>
                <div className="wk-tools">
                  <button type="button" className="icon-btn sm" aria-label={`Remove ${e.name}`} onClick={() => setDay(d.id, { items: d.items.filter((x) => x.id !== i.id) })}><Icon name="x" size={16} /></button>
                </div>
              </div>
            );
          })}
          <div className="pad-sm"><button type="button" className="btn btn-outline btn-block" onClick={() => setAddingTo(d.id)}><Icon name="plus" size={16} /> Add exercise to {d.name || `day ${di + 1}`}</button></div>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-block" onClick={() => set({ days: [...p.days, { id: uid(), name: `Day ${p.days.length + 1}`, items: [] }] })}><Icon name="plus" size={16} /> Add workout day</button>
      <p className="small">Write a plan for every exercise in each phase: progress by adding weight or reps, regress to deload. Tap a phase above to switch. Changes save automatically.</p>

      {c ? (
        <>
          <div className="grid2">
            <button className="btn btn-outline" onClick={preview}>Preview {c.firstName}'s view</button>
            <SendPlanButton p={p} c={c} />
          </div>
          <button className="btn btn-outline btn-block" onClick={saveToLibrary}>Save to program library</button>
        </>
      ) : (
        <button className="btn btn-block btn-lg" disabled={!p.days.some((d) => d.items.length)} onClick={() => setAssigning(true)}>Assign to a client</button>
      )}
      <button className="btn-ghost danger" onClick={() => { if (confirm(`Delete "${p.name}"?`)) { del('programs', p.id); nav(-1); } }}>Delete program</button>

      {addingTo && (
        <AddExerciseSheet onClose={() => setAddingTo(null)} onPick={(exerciseId) => {
          setDay(addingTo, { items: [...p.days.find((d) => d.id === addingTo)!.items, { id: uid(), exerciseId, plans: p.phases.map(() => '') }] });
          setAddingTo(null);
        }} />
      )}
      {assigning && <AssignSheet p={p} onClose={() => setAssigning(false)} />}
    </div>
  );
}

function AssignSheet({ p, onClose }: { p: Program; onClose: () => void }) {
  const { snap, save, today } = useStore();
  const nav = useNavigate();
  const [start, setStart] = useState(today);
  const clients = snap.clients.filter((c) => c.active).sort(byName);
  const assign = (c: Client) => {
    const copy = copyProgram(p, c.id, start);
    save('programs', copy);
    nav(`/programs/${copy.id}`, { replace: true });
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet form" role="dialog" aria-label="Assign program" onClick={(e) => e.stopPropagation()}>
        <strong>Assign "{p.name}"</strong>
        <label>Start date<input type="date" value={start} onChange={(e) => setStart(e.target.value || today)} /></label>
        {clients.length === 0 && <p className="muted">Add a client first.</p>}
        <div className="card">
          {clients.map((c) => (
            <button key={c.id} type="button" className="row row-link text-left" onClick={() => assign(c)}>
              <span className="grow"><strong>{fullName(c)}</strong></span><Icon name="chevron" size={16} />
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/** Public, read-only plan page a client opens from their link. Everything it shows is inside the link. */
export function PlanView() {
  const { data } = useParams();
  const [params] = useSearchParams();
  const [plan, setPlan] = useState<PlanPayload | null | undefined>(undefined);
  const today = todayIso();
  const pos = plan ? programPosition({ phases: plan.ph.map((x) => ({ label: x.l, note: x.no })), phaseWeeks: plan.w, startDate: plan.s }, today) : null;
  const [ph, setPh] = useState<number | null>(null);
  const dayParam = params.get('day');
  useEffect(() => { decodePlan(data!).then(setPlan).catch(() => setPlan(null)); }, [data]);

  if (plan === undefined) return <div className="center-screen"><p className="muted">Loading…</p></div>;
  if (!plan) return <div className="center-screen"><p><strong>This plan link isn't complete.</strong></p><p className="muted">Ask your trainer to send it again.</p></div>;
  const phase = ph ?? pos!.phase;
  const weeks = plan.ph.length * plan.w;
  const days = dayParam !== null ? plan.d.filter((_, i) => String(i) === dayParam) : plan.d;
  const label = (k: number) => phaseWeeksLabel({ phaseWeeks: plan.w }, k);

  return (
    <div className="page plan-view">
      <Brand variant="full" />
      <h1 className="display">{plan.c ? `${plan.c}'s plan` : plan.n}</h1>
      <p className="muted">{plan.n} · {weeks} weeks{plan.s ? ` · started ${fmtLong(plan.s)}` : ''}</p>
      {pos && pos.status === 'active' && <div className="card good-card">You're in week {pos.week} of {weeks}: {plan.ph[pos.phase]?.l}</div>}
      {pos && pos.status === 'upcoming' && plan.s && <div className="card pad">Starts {fmtLong(plan.s)}</div>}

      <div className="phase-tabs" role="tablist">
        {plan.ph.map((x, k) => (
          <button key={k} type="button" className={`phase-tab${k === phase ? ' on' : ''}`} aria-pressed={k === phase} onClick={() => setPh(k)}>
            <span>{label(k)}</span><strong>{x.l}</strong>
          </button>
        ))}
      </div>
      {plan.ph[phase]?.no && <p className="phase-note">{plan.ph[phase].no}</p>}

      {days.map((d) => {
        const di = plan.d.indexOf(d);
        return (
          <section className="card" key={di} id={`day-${di}`}>
            <div className="row"><strong className="grow day-title">{d.n}</strong>{dayParam === null && <a className="link-btn sm" href={`#/plan/${data}?day=${di}`}>Open</a>}</div>
            {d.i.map((x, k) => (
              <div className="row" key={k}>
                <a className="grow plan-ex" href={x.u} target="_blank" rel="noreferrer"><span><Icon name="play" size={14} /> {x.e}</span><span className="small">How-to video</span></a>
                <strong className="plan-dose">{x.p[phase] || '—'}</strong>
              </div>
            ))}
          </section>
        );
      })}
      {dayParam !== null && <a className="btn btn-outline btn-block" href={`#/plan/${data}`}>See the full plan</a>}
      <p className="small center">From {plan.t} at {plan.b}. Tap an exercise to watch how to do it.</p>
    </div>
  );
}

