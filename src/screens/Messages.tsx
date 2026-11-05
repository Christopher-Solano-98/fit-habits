import { useState } from 'react';
import type { Channel, Motivation, Template } from '@shared/types.ts';
import { fmtShort, fmtTime, WEEKDAYS } from '@shared/dates.ts';
import { smsHref } from '@shared/messages.ts';
import { useStore } from '../data/store';
import { nowIso, uid } from '../data/repo';
import { Header, Section, Seg, Toggle } from '../components/ui';
import { Icon } from '../components/Icon';

export function Messages() {
  const { snap, saveSettings, save, del, toast, repo } = useStore();
  const s = snap.settings;
  const m = s.motivation;
  const lib = [...snap.motivations].sort((a, b) => (a.sentOn ?? '') < (b.sentOn ?? '') ? -1 : 1);
  const next = lib.find((x) => !x.sentOn) ?? lib[0];
  const [editing, setEditing] = useState<Motivation | Template | null>(null);
  const [editKind, setEditKind] = useState<'motivation' | 'template'>('motivation');

  const setMotivation = (patch: Partial<typeof m>) => saveSettings({ ...s, motivation: { ...m, ...patch } });
  const active = snap.clients.filter((c) => c.active && c.channel !== 'none');

  const copyNext = async () => {
    if (!next) return;
    await navigator.clipboard?.writeText(next.body);
    toast('Copied. Paste it into a group text or your story.');
  };

  return (
    <div className="page">
      <Header title="Messages" sub="Newsletters, reminders and reports on autopilot" />

      <div className="card dark pad stack-sm">
        <div className="row-plain">
          <span className="grow eyebrow">Weekly motivation</span>
          <Toggle on={m.enabled} label="Weekly motivation" onChange={(v) => setMotivation({ enabled: v })} />
        </div>
        {next ? <p className="quote">"{next.body}"</p> : <p className="muted">Add a message to the library below.</p>}
        <div className="grid2">
          <label className="on-dark">Day
            <select value={m.weekday} onChange={(e) => setMotivation({ weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <label className="on-dark">Time<input type="time" value={m.time} onChange={(e) => setMotivation({ time: e.target.value })} /></label>
        </div>
        <Seg<Channel> dark value={m.channel} options={[['text', 'Text'], ['email', 'Email'], ['both', 'Both']]} onChange={(v) => setMotivation({ channel: v })} />
        <span className="small on-dark">{m.enabled ? `Goes to ${active.length} active clients every ${WEEKDAYS[m.weekday]} at ${fmtTime(m.time)}.` : 'Paused.'} {repo.mode === 'demo' ? 'Automatic sending turns on once texting and email are set up.' : ''}</span>
        <div className="grid2">
          {s.phone ? <a className="btn btn-outline-dark" href={next ? smsHref(s.phone, next.body) : undefined}>Text me a test</a> : <button className="btn btn-outline-dark" onClick={() => toast('Add your phone number in Settings')}>Text me a test</button>}
          <button className="btn btn-light" onClick={copyNext}>Copy message</button>
        </div>
      </div>

      <Section title="Motivation library" action={<button className="link-btn" onClick={() => { setEditKind('motivation'); setEditing({ id: uid(), body: '', sentOn: null, createdAt: nowIso() }); }}>+ Add</button>}>
        <p className="small">Sends go in order, oldest-sent first, so nobody gets a repeat until the list runs out.</p>
        <div className="card">
          {lib.map((x) => (
            <button key={x.id} className="row row-link text-left" onClick={() => { setEditKind('motivation'); setEditing(x); }}>
              <span className="grow"><span>{x.body}</span><span className="small">{x.sentOn ? `Last sent ${fmtShort(x.sentOn)}` : 'Not sent yet'}{x.id === next?.id ? ' · next up' : ''}</span></span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Quick replies" action={<button className="link-btn" onClick={() => { setEditKind('template'); setEditing({ id: uid(), title: '', body: '', sort: snap.templates.length }); }}>+ Add</button>}>
        <p className="small">Use {'{first}'}, {'{rate}'}, {'{schedule}'} or {'{trainer}'} and they fill in for each client.</p>
        <div className="card">
          {[...snap.templates].sort((a, b) => a.sort - b.sort).map((t) => (
            <button key={t.id} className="row row-link text-left" onClick={() => { setEditKind('template'); setEditing(t); }}>
              <span className="grow"><strong>{t.title}</strong><span className="small">{t.body}</span></span>
              <Icon name="edit" size={16} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="Automations">
        <div className="card">
          <div className="row">
            <span className="grow"><strong>Missed-payment alerts</strong><span className="small">In the app, plus an email to you when a payment is {s.alerts.graceDays}+ days late</span></span>
            <Toggle on={s.alerts.missedPayments} label="Missed-payment alerts" onChange={(v) => saveSettings({ ...s, alerts: { ...s.alerts, missedPayments: v } })} />
          </div>
          <div className="row">
            <span className="grow"><strong>Email me after</strong></span>
            <select className="inline-select" value={s.alerts.graceDays} onChange={(e) => saveSettings({ ...s, alerts: { ...s.alerts, graceDays: Number(e.target.value) } })}>
              {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''} late</option>)}
            </select>
          </div>
          {([['weekly', 'Weekly "who paid" email', 'Fridays at 6:00 PM'], ['biweekly', 'Biweekly summary', 'Every other Friday'], ['monthly', 'Monthly summary', '1st of each month']] as const).map(([k, label, detail]) => (
            <div className="row" key={k}>
              <span className="grow"><strong>{label}</strong><span className="small">{detail}</span></span>
              <Toggle on={s.reports[k]} label={label} onChange={(v) => saveSettings({ ...s, reports: { ...s.reports, [k]: v } })} />
            </div>
          ))}
          <div className="row">
            <span className="grow"><strong>Body scan reminders</strong><span className="small">Remind you when a client is due for a new scan</span></span>
            <select className="inline-select" value={s.scanReminderMonths} onChange={(e) => saveSettings({ ...s, scanReminderMonths: Number(e.target.value) })}>
              {[3, 4, 5, 6].map((n) => <option key={n} value={n}>Every {n} mo</option>)}
            </select>
          </div>
        </div>
      </Section>

      {editing && (
        <EditSheet
          kind={editKind}
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(x) => { save(editKind === 'motivation' ? 'motivations' : 'templates', x as never); setEditing(null); toast('Saved'); }}
          onDelete={() => { del(editKind === 'motivation' ? 'motivations' : 'templates', editing.id); setEditing(null); toast('Deleted'); }}
        />
      )}
    </div>
  );
}

function EditSheet({ kind, item, onClose, onSave, onDelete }: { kind: 'motivation' | 'template'; item: Motivation | Template; onClose: () => void; onSave: (x: Motivation | Template) => void; onDelete: () => void }) {
  const [body, setBody] = useState(item.body);
  const [title, setTitle] = useState('title' in item ? item.title : '');
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet form" role="dialog" aria-label="Edit message" onClick={(e) => e.stopPropagation()}>
        <strong>{kind === 'motivation' ? 'Motivation message' : 'Quick reply'}</strong>
        {kind === 'template' && <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>}
        <label>Message<textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <span className="small">{body.length} characters{body.length > 160 ? ' · sends as more than one text' : ''}</span>
        <button className="btn btn-block" disabled={!body.trim()} onClick={() => onSave(kind === 'template' ? { ...(item as Template), title: title || 'Untitled', body } : { ...(item as Motivation), body })}>Save</button>
        <button className="btn-ghost danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
