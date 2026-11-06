import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { BillingCycle, Channel, Client } from '@shared/types.ts';
import { WEEKDAYS, WEEKDAYS_SHORT } from '@shared/dates.ts';
import { useStore } from '../data/store';
import { nowIso, uid } from '../data/repo';
import { Header, Seg } from '../components/ui';

const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

export function ClientForm() {
  const { id } = useParams();
  const { client, save, del, today, toast, snap, repo } = useStore();
  const nav = useNavigate();
  const existing = id ? client(id) : undefined;
  const [c, setC] = useState<Client>(() => existing ?? {
    id: uid(), firstName: '', lastName: '', birthDate: null, gender: null, phone: null, email: null, address: null,
    sessionDays: [], sessionTime: null, rate: 0, cycle: 'weekly', dueWeekday: 1, dueDayOfMonth: 1, channel: 'text',
    medicalCurrent: null, medicalPast: null, emergencyName: null, emergencyPhone: null, notes: null,
    startDate: today, active: true, createdAt: nowIso(),
  });

  const set = <K extends keyof Client>(k: K, v: Client[K]) => setC((p) => ({ ...p, [k]: v }));
  const text = (k: keyof Client) => ({
    value: (c[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => set(k, (e.target.value || null) as never),
  });
  const toggleDay = (d: number) => set('sessionDays', c.sessionDays.includes(d) ? c.sessionDays.filter((x) => x !== d) : [...c.sessionDays, d]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!c.firstName.trim()) return toast('Add a first name');
    await save('clients', { ...c, firstName: c.firstName.trim(), lastName: c.lastName.trim() });
    toast(existing ? 'Saved' : `${c.firstName} added`);
    nav(`/clients/${c.id}`, { replace: true });
  };

  const remove = async () => {
    if (!existing || !confirm(`Delete ${existing.firstName} and all of their payments, files and progress? This can't be undone. To keep their history, mark them inactive instead.`)) return;
    // Storage objects aren't removed by the database cascade, so delete files first.
    for (const f of snap.files.filter((x) => x.clientId === existing.id)) await repo.deleteFile(f).catch(() => undefined);
    await del('clients', existing.id);
    toast(`${existing.firstName} deleted`);
    nav('/clients', { replace: true });
  };

  return (
    <form className="page form" onSubmit={submit}>
      <Header title={existing ? `Edit ${existing.firstName}` : 'New client'} back help={existing ? 'edit-client' : 'add-client'} />

      <fieldset>
        <legend>About</legend>
        <div className="grid2">
          <label>First name<input required autoComplete="off" value={c.firstName} onChange={(e) => set('firstName', e.target.value)} /></label>
          <label>Last name<input autoComplete="off" value={c.lastName} onChange={(e) => set('lastName', e.target.value)} /></label>
        </div>
        <div className="grid2">
          <label>Birthday<input type="date" {...text('birthDate')} /></label>
          <label>Gender
            <select {...text('gender')}>
              <option value="">—</option><option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Contact</legend>
        <label>Mobile phone<input type="tel" inputMode="tel" autoComplete="off" {...text('phone')} /></label>
        <label>Email<input type="email" autoComplete="off" {...text('email')} /></label>
        <label>Address<input autoComplete="off" {...text('address')} /></label>
        <label>Send receipts and messages by</label>
        <Seg<Channel> value={c.channel} options={[['text', 'Text'], ['email', 'Email'], ['both', 'Both'], ['none', 'None']]} onChange={(v) => set('channel', v)} />
        <div className="grid2">
          <label>Emergency contact<input autoComplete="off" {...text('emergencyName')} /></label>
          <label>Their phone<input type="tel" autoComplete="off" {...text('emergencyPhone')} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Schedule</legend>
        <div className="days">
          {MON_FIRST.map((d) => (
            <button type="button" key={d} aria-pressed={c.sessionDays.includes(d)} className={c.sessionDays.includes(d) ? 'on' : ''} onClick={() => toggleDay(d)}>{WEEKDAYS_SHORT[d]}</button>
          ))}
        </div>
        <div className="grid2">
          <label>Session time<input placeholder="6:00 AM" {...text('sessionTime')} /></label>
          <label>Start date<input type="date" value={c.startDate} onChange={(e) => set('startDate', e.target.value || today)} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Payment</legend>
        <Seg<BillingCycle> value={c.cycle} options={[['weekly', 'Weekly'], ['biweekly', '2 weeks'], ['monthly', 'Monthly'], ['per_session', 'Per session']]} onChange={(v) => set('cycle', v)} />
        <div className="grid2">
          <label>{c.cycle === 'per_session' ? 'Rate per session' : 'Rate'} ($)
            <input type="number" inputMode="decimal" min="0" step="1" value={c.rate || ''} onChange={(e) => set('rate', Number(e.target.value) || 0)} />
          </label>
          {(c.cycle === 'weekly' || c.cycle === 'biweekly') && (
            <label>Due on
              <select value={c.dueWeekday} onChange={(e) => set('dueWeekday', Number(e.target.value))}>
                {MON_FIRST.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
              </select>
            </label>
          )}
          {c.cycle === 'monthly' && (
            <label>Due on day<input type="number" min="1" max="31" value={c.dueDayOfMonth} onChange={(e) => set('dueDayOfMonth', Number(e.target.value) || 1)} /></label>
          )}
        </div>
        {c.cycle === 'per_session' && <p className="small">Payment is due on each session day.</p>}
      </fieldset>

      <fieldset>
        <legend>Health</legend>
        <label>Current conditions or injuries<textarea rows={2} {...text('medicalCurrent')} /></label>
        <label>Past conditions, injuries, surgeries<textarea rows={2} {...text('medicalPast')} /></label>
        <label>Notes<textarea rows={3} {...text('notes')} /></label>
      </fieldset>

      {existing && (
        <label className="check-row">
          <input type="checkbox" checked={c.active} onChange={(e) => set('active', e.target.checked)} />
          Active client (inactive clients don't get alerts, reminders or newsletters)
        </label>
      )}

      <button className="btn btn-block" type="submit">{existing ? 'Save changes' : 'Add client'}</button>
      {existing && <button type="button" className="btn-ghost danger" onClick={remove}>Delete client</button>}
    </form>
  );
}
