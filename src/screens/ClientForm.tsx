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

  // iPhone Safari won't say why a form didn't submit, so validation happens here
  // and each problem is shown under its own field.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!c.firstName.trim()) e.firstName = 'First name is required.';
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) e.email = 'Enter a full email like name@gmail.com, or leave it blank.';
    if (c.phone && c.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a 10-digit phone number, or leave it blank.';
    if (c.emergencyPhone && c.emergencyPhone.replace(/\D/g, '').length < 10) e.emergencyPhone = 'Enter a 10-digit phone number, or leave it blank.';
    if (c.rate < 0) e.rate = 'The rate can\u2019t be negative.';
    return e;
  };
  const clearError = (k: string) => errors[k] && setErrors((x) => { const n = { ...x }; delete n[k]; return n; });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`f-${first}`)?.scrollIntoView({ block: 'center' });
      return toast(Object.keys(found).length === 1 ? found[first] : 'Fix the fields marked in orange.');
    }
    await save('clients', { ...c, firstName: c.firstName.trim(), lastName: c.lastName.trim(), email: c.email?.trim() || null });
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
    <form className="page form" onSubmit={submit} noValidate>
      <Header title={existing ? `Edit ${existing.firstName}` : 'New client'} back help={existing ? 'edit-client' : 'add-client'} />
      <p className="small"><span className="req">*</span> Required. Everything else is optional and can be added later.</p>

      <fieldset>
        <legend>About</legend>
        <div className="grid2">
          <label><span>First name <span className="req">*</span></span><input id="f-firstName" className={errors.firstName ? 'invalid' : ''} autoComplete="off" value={c.firstName} onChange={(e) => { set('firstName', e.target.value); clearError('firstName'); }} /></label>
          <label>Last name<input autoComplete="off" value={c.lastName} onChange={(e) => set('lastName', e.target.value)} /></label>
        </div>
        {errors.firstName && <p className="field-error">{errors.firstName}</p>}
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
        <label>Mobile phone<input id="f-phone" className={errors.phone ? 'invalid' : ''} type="tel" inputMode="tel" autoComplete="off" value={c.phone ?? ''} onChange={(e) => { set('phone', e.target.value || null); clearError('phone'); }} /></label>
        {errors.phone && <p className="field-error">{errors.phone}</p>}
        <label>Email<input id="f-email" className={errors.email ? 'invalid' : ''} type="email" inputMode="email" autoCapitalize="none" autoComplete="off" value={c.email ?? ''} onChange={(e) => { set('email', e.target.value || null); clearError('email'); }} /></label>
        {errors.email && <p className="field-error">{errors.email}</p>}
        <label>Address<input autoComplete="off" {...text('address')} /></label>
        <label>Send receipts and messages by</label>
        <Seg<Channel> value={c.channel} options={[['text', 'Text'], ['email', 'Email'], ['both', 'Both'], ['none', 'None']]} onChange={(v) => set('channel', v)} />
        {(c.channel === 'text' || c.channel === 'both') && !c.phone && <p className="small">Add a mobile number above so receipts and messages can be texted.</p>}
        {(c.channel === 'email' || c.channel === 'both') && !c.email && <p className="small">Add an email above so receipts and messages can be emailed.</p>}
        <div className="grid2">
          <label>Emergency contact<input autoComplete="off" {...text('emergencyName')} /></label>
          <label>Their phone<input id="f-emergencyPhone" className={errors.emergencyPhone ? 'invalid' : ''} type="tel" autoComplete="off" value={c.emergencyPhone ?? ''} onChange={(e) => { set('emergencyPhone', e.target.value || null); clearError('emergencyPhone'); }} /></label>
        </div>
        {errors.emergencyPhone && <p className="field-error">{errors.emergencyPhone}</p>}
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
            <input id="f-rate" className={errors.rate ? 'invalid' : ''} type="number" inputMode="decimal" min="0" step="any" value={c.rate || ''} onChange={(e) => { set('rate', Number(e.target.value) || 0); clearError('rate'); }} />
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
        {errors.rate && <p className="field-error">{errors.rate}</p>}
        {!c.rate && <p className="small">Optional, but add a rate so the app can track who hasn't paid and send reminders.</p>}
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
