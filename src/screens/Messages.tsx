import { useEffect, useState } from 'react';
import type { Channel, Client, Motivation, Template } from '@shared/types.ts';
import { fmtShort, fmtTime, WEEKDAYS } from '@shared/dates.ts';
import { mailtoHref, motivationPreviewText, motivationReach, motivationRecipients, smsHref } from '@shared/messages.ts';
import { gasCall, getConnection } from '../data/connection';
import { byName, fullName } from '../lib/util';
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

  const [draft, setDraft] = useState(next?.body ?? '');
  const [draftFor, setDraftFor] = useState(next?.id);
  const [listOpen, setListOpen] = useState(false);
  if (next?.id !== draftFor) { setDraftFor(next?.id); setDraft(next?.body ?? ''); }

  const setMotivation = (patch: Partial<typeof m>) => saveSettings({ ...s, motivation: { ...m, ...patch } });
  const active = snap.clients.filter((c) => c.active);
  const recipients = motivationRecipients(active, m);
  const dirty = draft.trim() !== (next?.body ?? '').trim();

  const saveDraft = () => {
    const body = draft.trim();
    if (!body) return toast('Type a message first');
    save('motivations', next ? { ...next, body } : { id: uid(), body, sentOn: null, createdAt: nowIso() });
    toast(`Saved. This goes out ${WEEKDAYS[m.weekday]} at ${fmtTime(m.time)}.`);
  };

  const copyNext = async () => {
    if (!draft.trim()) return;
    await navigator.clipboard?.writeText(draft.trim());
    toast('Copied. Paste it into your story or a post.');
  };

  return (
    <div className="page">
      <Header title="Messages" sub="Newsletters, reminders and reports on autopilot" help="friday" />

      <div className="card dark pad stack-sm">
        <div className="row-plain">
          <span className="grow eyebrow">Weekly motivation</span>
          <Toggle on={m.enabled} label="Weekly motivation" onChange={(v) => setMotivation({ enabled: v })} />
        </div>
        <label className="on-dark composer">This week's message
          <textarea rows={4} value={draft} placeholder="Type this week's motivation…" onChange={(e) => setDraft(e.target.value)} />
        </label>
        <div className="row-plain">
          <span className="grow small on-dark">{draft.length} characters{draft.length > 160 ? ' · sends as more than one text' : ''}</span>
          {dirty && <button className="btn-sm" onClick={saveDraft}>Save message</button>}
        </div>
        <button className="recipients-btn" onClick={() => setListOpen(true)}>
          <Icon name="users" size={18} />
          <span className="grow">
            <strong>Goes to {recipients.length} of {active.length} client{active.length === 1 ? '' : 's'}</strong>
            <span className="small on-dark">{recipients.length ? recipients.slice(0, 3).map((c) => c.firstName).join(', ') + (recipients.length > 3 ? ` +${recipients.length - 3} more` : '') : 'Nobody yet: tap to choose'}</span>
          </span>
          <span className="small on-dark">Edit list</span>
          <Icon name="chevron" size={16} />
        </button>
        <div className="grid2">
          <label className="on-dark">Day
            <select value={m.weekday} onChange={(e) => setMotivation({ weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <label className="on-dark">Time<input type="time" value={m.time} onChange={(e) => setMotivation({ time: e.target.value })} /></label>
        </div>
        <Seg<Channel> dark value={m.channel} options={[['text', 'Text'], ['email', 'Email'], ['both', 'Both']]} onChange={(v) => setMotivation({ channel: v })} />
        <span className="small on-dark">{m.enabled ? `Sends every ${WEEKDAYS[m.weekday]} at ${fmtTime(m.time)}. Each client gets their own message; nobody sees the others.` : 'Paused.'} {repo.mode === 'demo' ? 'Automatic sending turns on once your Google account is connected.' : ''}</span>
        <div className="grid2">
          {s.phone ? <a className="btn btn-outline-dark" href={draft.trim() ? smsHref(s.phone, draft.trim()) : undefined}>Text me a test</a> : <button className="btn btn-outline-dark" onClick={() => toast('Add your phone number in Settings')}>Text me a test</button>}
          <button className="btn btn-light" onClick={copyNext}>Copy message</button>
        </div>
        <LastSend />
        <PreviewSettings />
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

      {listOpen && <RecipientsSheet onClose={() => setListOpen(false)} />}

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

/** The weekly distribution list: every active client, with a check to take them off (or put them back). */
function RecipientsSheet({ onClose }: { onClose: () => void }) {
  const { snap, saveSettings } = useStore();
  const s = snap.settings;
  const m = s.motivation;
  const excluded = m.excluded ?? [];
  const clients = snap.clients.filter((c) => c.active).sort(byName);
  const setExcluded = (ids: string[]) => saveSettings({ ...s, motivation: { ...m, excluded: ids } });
  const on = clients.filter((c) => !excluded.includes(c.id) && motivationReach(c, m).reason === null).length;
  const how = (c: Client) => {
    const r = motivationReach(c, m);
    return r.reason ?? [r.text && 'Text', r.email && 'Email'].filter(Boolean).join(' + ');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Weekly motivation list" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Weekly list</strong>
          <span className="small">{on} of {clients.length} on</span>
        </div>
        <p className="small">Everyone is on the list by default, including clients you add later. Uncheck anyone who shouldn't get it.</p>
        <div className="grid2">
          <button className="btn-sm btn-outline" onClick={() => setExcluded([])}>Select all</button>
          <button className="btn-sm btn-outline" onClick={() => setExcluded(clients.map((c) => c.id))}>Clear all</button>
        </div>
        {clients.length === 0 && <p className="muted">No clients yet. Add clients and they'll show up here.</p>}
        <div className="card">
          {clients.map((c) => {
            const reason = motivationReach(c, m).reason;
            const checked = !excluded.includes(c.id);
            return (
              <label key={c.id} className="row check-list">
                <input type="checkbox" checked={checked} onChange={() => setExcluded(checked ? [...excluded, c.id] : excluded.filter((id) => id !== c.id))} />
                <span className="grow">
                  <strong>{fullName(c)}</strong>
                  <span className={`small${reason && checked ? ' warn-text' : ''}`}>{reason && checked ? `Won't receive it: ${reason.toLowerCase()}` : how(c)}</span>
                </span>
              </label>
            );
          })}
        </div>
        <button className="btn btn-block" onClick={onClose}>Done</button>
      </div>
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

/** Day-before preview email to the trainer: what goes out tomorrow and to whom. */
function PreviewSettings() {
  const { snap, saveSettings, toast, repo } = useStore();
  const s = snap.settings;
  const m = s.motivation;
  const pv = m.preview ?? { enabled: true, email: '', time: '07:00' };
  const [email, setEmail] = useState(pv.email);
  const [sending, setSending] = useState(false);
  const save = (patch: Partial<typeof pv>) =>
    saveSettings({ ...s, appUrl: `${location.origin}${location.pathname}`, motivation: { ...m, preview: { ...pv, ...patch } } });
  const dayBefore = WEEKDAYS[(m.weekday + 6) % 7];
  const to = pv.email || s.email;

  const sendNow = async () => {
    const conn = getConnection();
    if (email.trim() !== pv.email) save({ email: email.trim() });
    if (repo.mode === 'sheets' && conn) {
      setSending(true);
      try {
        // Save first so the server uses the email just typed.
        await saveSettings({ ...s, appUrl: `${location.origin}${location.pathname}`, motivation: { ...m, preview: { ...pv, email: email.trim() } } });
        const r = await gasCall<{ to: string }>(conn.api, { action: 'motivationPreview', key: conn.key });
        toast(`Preview emailed to ${r.to}`);
      } catch (e) {
        toast(`Couldn't send the preview: ${(e as Error).message}`);
      } finally {
        setSending(false);
      }
      return;
    }
    // Not connected: open Mail with the same preview text.
    const lib = [...snap.motivations].sort((a, b) => ((a.sentOn ?? '') < (b.sentOn ?? '') ? -1 : 1));
    const active = snap.clients.filter((c) => c.active);
    const body = motivationPreviewText({
      message: lib[0]?.body ?? '', weekdayName: WEEKDAYS[m.weekday], time: fmtTime(m.time), channel: m.channel,
      to: motivationRecipients(active, m),
      notTo: active.filter((c) => motivationReach(c, m).reason).map((c) => ({ client: c, reason: motivationReach(c, m).reason!.toLowerCase() })),
      appUrl: `${location.origin}${location.pathname}`,
    });
    location.href = mailtoHref(email.trim() || s.email || '', "Preview: tomorrow's Fit Habits motivation", body);
  };

  return (
    <div className="preview-box stack-sm">
      <div className="row-plain">
        <span className="grow">
          <strong>Email me a preview the day before</strong>
          <span className="small on-dark">{pv.enabled ? `${dayBefore} at ${fmtTime(pv.time)}: the message and who it's going to${to ? `, sent to ${to}` : ''}.` : 'Off'}</span>
        </span>
        <Toggle on={pv.enabled} label="Day-before preview" onChange={(v) => save({ enabled: v })} />
      </div>
      {pv.enabled && (
        <div className="grid2">
          <label className="on-dark">Send preview to<input type="email" inputMode="email" autoCapitalize="none" placeholder={s.email || 'you@gmail.com'} value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => email.trim() !== pv.email && save({ email: email.trim() })} /></label>
          <label className="on-dark">At<input type="time" value={pv.time} onChange={(e) => save({ time: e.target.value || '07:00' })} /></label>
        </div>
      )}
      <button className="btn btn-outline-dark" disabled={sending} onClick={sendNow}>{sending ? 'Sending…' : 'Send preview now'}</button>
    </div>
  );
}

interface SendSummary {
  date: string;
  sentAt: string;
  message: string;
  got: { id: string; name: string; how: string }[];
  failed: { id: string; name: string; reason: string }[];
  missed: { id: string; name: string; reason: string; textYourself?: boolean }[];
}

/** Who actually got the last weekly motivation, with a Text button for anyone it couldn't reach on its own. */
function LastSend() {
  const { snap, repo } = useStore();
  const [sum, setSum] = useState<SendSummary | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const conn = getConnection();
    if (repo.mode !== 'sheets' || !conn) return;
    gasCall<SendSummary | null>(conn.api, { action: 'motivationStatus', key: conn.key }).then(setSum).catch(() => setSum(null));
  }, [repo]);
  if (repo.mode !== 'sheets' || sum === undefined) return null;
  if (!sum) return <div className="preview-box"><span className="small on-dark">Not sent yet. After it goes out, you'll see here who got it, and you'll get an email.</span></div>;
  const phone = (id: string) => snap.clients.find((c) => c.id === id)?.phone;
  const toText = sum.missed.filter((x) => x.textYourself && phone(x.id));
  const when = new Date(sum.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="preview-box stack-sm">
      <button type="button" className="row-plain link-row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span style={{ color: '#9FD8B7' }}><Icon name="check" size={18} /></span>
        <span className="grow">
          <strong>Last sent {fmtShort(sum.date)} at {when}</strong>
          <span className="small on-dark">{sum.got.length} got it{sum.failed.length ? ` · ${sum.failed.length} didn't go through` : ''}{sum.missed.length ? ` · ${sum.missed.length} not sent` : ''}</span>
        </span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="stack-sm small on-dark">
          {sum.got.map((x) => <div key={x.id}>✓ {x.name} <span className="muted-dark">by {x.how}</span></div>)}
          {sum.failed.map((x) => <div key={x.id} className="warn-text">✗ {x.name}: {x.reason}</div>)}
          {sum.missed.map((x) => (
            <div key={x.id} className="row-plain">
              <span className="grow">– {x.name}: {x.reason}</span>
              {x.textYourself && phone(x.id) && <a className="btn-sm" href={smsHref(phone(x.id)!, sum.message)}>Text</a>}
            </div>
          ))}
        </div>
      )}
      {toText.length > 0 && !open && (
        <span className="small on-dark">{toText.length} client{toText.length === 1 ? '' : 's'} only take{toText.length === 1 ? 's' : ''} texts. Tap above to text {toText.length === 1 ? 'them' : 'each one'} this week's message.</span>
      )}
    </div>
  );
}
