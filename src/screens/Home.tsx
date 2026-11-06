import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Client } from '@shared/types.ts';
import { needsAttention, sumPayments } from '@shared/billing.ts';
import { addDays, addMonths, fmtDay, fmtLong, fmtShort, fmtTime, startOfWeek, weekday, WEEKDAYS } from '@shared/dates.ts';
import { change, series } from '@shared/metrics.ts';
import { motivationRecipients } from '@shared/messages.ts';
import { useStore } from '../data/store';
import { moveToSheet, phoneOnlyData, setAside } from '../data/phoneData';
import { IS_SAMPLE } from '../lib/space';
import { Avatar, HelpButton, Pill, QuickText, Section } from '../components/ui';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';
import { byName, fullName, money, timeToMinutes } from '../lib/util';

export function Home() {
  const { snap, today, status, repo } = useStore();
  const nav = useNavigate();
  const [texting, setTexting] = useState<Client | null>(null);
  const active = snap.clients.filter((c) => c.active);
  const week = startOfWeek(today);
  const collected = sumPayments(snap.payments, week, addDays(week, 6));
  const billable = active.filter((c) => status(c).state !== 'none');
  const paid = billable.filter((c) => status(c).state === 'paid');
  const alerts = active.filter((c) => needsAttention(status(c))).sort((a, b) => status(b).daysLate - status(a).daysLate);
  const sessions = active.filter((c) => c.sessionDays.includes(weekday(today))).sort((a, b) => timeToMinutes(a.sessionTime) - timeToMinutes(b.sessionTime));

  const months = snap.settings.scanReminderMonths;
  const scansDue = active
    .map((c) => {
      const pts = series(snap.measurements, c.id, 'bodyFat');
      const last = pts[pts.length - 1]?.date;
      return { c, due: last ? addMonths(last, months) : null };
    })
    .filter((x) => x.due && x.due <= addDays(today, 14))
    .sort((a, b) => (a.due! < b.due! ? -1 : 1));

  const wins = active
    .map((c) => ({ c, ch: change('bodyFat', series(snap.measurements, c.id, 'bodyFat')) ?? change('weight', series(snap.measurements, c.id, 'weight')) }))
    .filter((x) => x.ch && x.ch.good && x.ch.delta !== 0)
    .slice(0, 3);

  const m = snap.settings.motivation;
  const daysToSend = (m.weekday - weekday(today) + 7) % 7;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <div className="topline">
        <div>
          <Brand />
          <div className="small">{fmtDay(today)}{IS_SAMPLE ? ' · Practice (fake clients)' : repo.mode === 'demo' ? ' · Saved on this phone' : ''}</div>
        </div>
        <div className="header-actions">
          <HelpButton topic="who-paid" />
          <Link to="/settings" className="icon-btn" aria-label="Settings"><Icon name="settings" /></Link>
        </div>
      </div>
      <h1 className="display">{greeting}, {snap.settings.trainerName}</h1>
      {repo.mode === 'sheets' && <PhoneDataCard />}

      <div className="grid2">
        <div className="stat stat-dark">
          <span className="stat-label">Collected this week</span>
          <span className="stat-value">{money(collected)}</span>
          <span className="stat-label">{fmtShort(week)} – {fmtShort(addDays(week, 6))}</span>
        </div>
        <Link to="/reports" className="stat">
          <span className="stat-label">Paid up</span>
          <span className="stat-value">{paid.length} <small>of {billable.length}</small></span>
          <span className="stat-label">clients this period</span>
        </Link>
      </div>

      {active.length === 0 && (
        <div className="card pad center">
          <p><strong>Add your first client</strong></p>
          <p className="muted">Load everyone you train, then log payments as they come in.</p>
          <Link to="/clients/new" className="btn">Add client</Link>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="card alert-card">
          <div className="alert-head">
            <Icon name="alert" />
            <div>
              <strong>{alerts.length} payment{alerts.length === 1 ? '' : 's'} not logged</strong>
              <div className="small">{snap.settings.alerts.missedPayments ? `You'll get an email reminder too once a payment is ${snap.settings.alerts.graceDays}+ days late.` : 'Email reminders are off.'}</div>
            </div>
          </div>
          {alerts.map((c) => (
            <div className="row" key={c.id}>
              <button className="row-main" onClick={() => nav(`/clients/${c.id}`)}>
                <strong>{fullName(c)}</strong>
                <span className="small">{money(status(c).owed)} · {status(c).label}</span>
              </button>
              <button className="btn-sm btn-outline" onClick={() => setTexting(c)}>Text</button>
              <Link className="btn-sm" to={`/log?client=${c.id}`}>Log</Link>
            </div>
          ))}
        </div>
      )}
      {alerts.length === 0 && billable.length > 0 && (
        <div className="card good-card"><Icon name="check" /> Everyone is paid up.</div>
      )}

      <Section title={`Today · ${WEEKDAYS[weekday(today)]}`}>
        {sessions.length === 0 ? <div className="card pad muted">No sessions on the schedule today.</div> : (
          <div className="card">
            {sessions.map((c) => (
              <Link key={c.id} to={`/clients/${c.id}`} className="row row-link">
                <span className="time">{c.sessionTime ?? '—'}</span>
                <span className="grow"><strong>{fullName(c)}</strong></span>
                <Pill status={status(c)} short />
              </Link>
            ))}
          </div>
        )}
      </Section>

      {scansDue.length > 0 && (
        <Section title="Body scans due">
          <div className="card">
            {scansDue.map(({ c, due }) => (
              <Link key={c.id} to={`/clients/${c.id}?tab=progress`} className="row row-link">
                <Avatar c={c} size={36} />
                <span className="grow"><strong>{fullName(c)}</strong><span className="small">{due! < today ? `Overdue since ${fmtShort(due!)}` : `Due ${fmtShort(due!)}`}</span></span>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        </Section>
      )}

      {wins.length > 0 && (
        <Section title="Client wins">
          <div className="card">
            {wins.sort((a, b) => byName(a.c, b.c)).map(({ c, ch }) => (
              <Link key={c.id} to={`/clients/${c.id}?tab=progress`} className="row row-link">
                <span className="win-icon"><Icon name="trend" size={18} /></span>
                <span className="grow"><strong>{c.firstName}</strong><span className="small">{ch!.text} since {fmtLong(ch!.first.date)}</span></span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Link to="/messages" className="card row row-link">
        <span className="win-icon"><Icon name="bolt" size={18} /></span>
        <span className="grow">
          <strong>{m.enabled ? 'Friday motivation' : 'Weekly motivation is off'}</strong>
          <span className="small">{m.enabled ? `${daysToSend === 0 ? 'Goes out today' : `Next: ${WEEKDAYS[m.weekday]}`} at ${fmtTime(m.time)} · ${motivationRecipients(active, m).length} on the list` : 'Turn it on in Messages'}</span>
        </span>
        <Icon name="chevron" size={18} />
      </Link>

      {texting && <QuickText client={texting} onClose={() => setTexting(null)} />}
    </div>
  );
}

/** Records saved on this phone before it was connected: offer to move them into the Sheet. */
function PhoneDataCard() {
  const { snap, repo, reload, toast } = useStore();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState('');
  const found = useMemo(() => phoneOnlyData(snap), [snap]);
  if (!found || hidden) return null;
  const what = [
    found.clients && `${found.clients} client${found.clients === 1 ? '' : 's'}`,
    found.payments && `${found.payments} payment${found.payments === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' and ') || `${found.total} change${found.total === 1 ? '' : 's'}`;
  const names = found.local.clients.filter((c) => found.rows.some((r) => r.row.id === c.id)).map((c) => c.firstName).slice(0, 6).join(', ');
  const move = async () => {
    setBusy('Moving…');
    try {
      await moveToSheet(repo, snap, found, (d, t) => setBusy(`Moving ${d} of ${t}…`));
      await reload();
      setHidden(true);
      toast('Moved to your Google Sheet');
    } catch (e) {
      setBusy('');
      toast(`Couldn't finish: ${(e as Error).message}. Tap Move again; nothing is lost.`);
      reload();
    }
  };
  return (
    <div className="card alert-card">
      <div className="alert-head">
        <Icon name="alert" size={20} />
        <span className="grow">
          <strong>Found {what} saved only on this phone</strong>
          <span className="small">{names ? `${names}. ` : ''}These were added before this phone was connected, so they aren’t in your Google Sheet yet.</span>
        </span>
      </div>
      <div className="pad stack-sm">
        <button className="btn btn-block" disabled={!!busy} onClick={move}>{busy || 'Move them to my Google Sheet'}</button>
        {!busy && <button className="btn btn-outline btn-block" onClick={() => { if (confirm('Leave these off? They’ll stop showing here (a copy stays on this phone).')) { setAside(); setHidden(true); } }}>These were just tests, leave them off</button>}
      </div>
    </div>
  );
}
