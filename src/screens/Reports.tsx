import { useState } from 'react';
import { Link } from 'react-router-dom';
import { reportRanges, sumPayments, type ReportRange } from '@shared/billing.ts';
import { fmtShort, inRange } from '@shared/dates.ts';
import { mailtoHref } from '@shared/messages.ts';
import { useStore } from '../data/store';
import { Header, Seg } from '../components/ui';
import { Icon } from '../components/Icon';
import { byName, csv, download, fullName, money } from '../lib/util';

export function Reports() {
  const { snap, today, toast } = useStore();
  const ranges = reportRanges(today);
  const [key, setKey] = useState<ReportRange['key']>('week');
  const r = ranges.find((x) => x.key === key)!;
  const pays = snap.payments.filter((p) => inRange(p.paidOn, r.from, r.to));
  const total = sumPayments(snap.payments, r.from, r.to);
  const clients = snap.clients.slice().sort(byName);
  const paidRows = clients.map((c) => {
    const mine = pays.filter((p) => p.clientId === c.id);
    return { c, n: mine.length, total: mine.reduce((t, p) => t + p.amount, 0) };
  }).filter((x) => x.n > 0).sort((a, b) => b.total - a.total);
  const unpaid = clients.filter((c) => c.active && c.rate > 0 && !pays.some((p) => p.clientId === c.id));
  const rangeText = `${fmtShort(r.from)} – ${fmtShort(r.to)}`;

  const summary = [
    `${snap.settings.businessName} — ${r.label.toLowerCase()} (${rangeText})`,
    `Collected: ${money(total)} from ${pays.length} payment${pays.length === 1 ? '' : 's'}`,
    '', 'PAID',
    ...paidRows.map((x) => `${fullName(x.c)}: ${money(x.total)}`),
    '', 'NO PAYMENT LOGGED',
    ...(unpaid.length ? unpaid.map((c) => fullName(c)) : ['Nobody. Everyone paid!']),
  ].join('\n');

  const exportCsv = () => {
    const rows = [['Date', 'Client', 'Cash amount', 'Note'], ...pays.sort((a, b) => (a.paidOn < b.paidOn ? -1 : 1)).map((p) => {
      const c = snap.clients.find((x) => x.id === p.clientId);
      return [p.paidOn, c ? fullName(c) : 'Deleted client', p.amount, p.note ?? ''];
    })];
    download(`fit-habits-payments-${r.from}-to-${r.to}.csv`, csv(rows));
  };

  return (
    <div className="page">
      <Header title="Reports" sub={`${r.label} · ${rangeText}`} help="reports" />
      <Seg value={key} options={ranges.map((x) => [x.key, x.label] as [ReportRange['key'], string])} onChange={setKey} />
      <div className="grid2">
        <div className="stat stat-dark"><span className="stat-label">Cash collected</span><span className="stat-value">{money(total)}</span></div>
        <div className="stat"><span className="stat-label">Payments logged</span><span className="stat-value">{pays.length}</span></div>
      </div>

      <h2 className="h2 ok">Paid</h2>
      <div className="card">
        {paidRows.length === 0 && <div className="row muted">No payments in this period yet.</div>}
        {paidRows.map((x) => (
          <Link key={x.c.id} to={`/clients/${x.c.id}?tab=pay`} className="row row-link">
            <span className="grow"><strong>{fullName(x.c)}</strong><span className="small">{x.n} payment{x.n === 1 ? '' : 's'}</span></span>
            <strong className="num">{money(x.total)}</strong>
          </Link>
        ))}
      </div>

      {unpaid.length > 0 && (
        <>
          <h2 className="h2 warn-text">No payment logged</h2>
          <div className="card warn-border">
            {unpaid.map((c) => (
              <div key={c.id} className="row">
                <span className="grow"><strong>{fullName(c)}</strong></span>
                <Link className="btn-sm" to={`/log?client=${c.id}`}>Log</Link>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="grid2">
        {snap.settings.email
          ? <a className="btn" href={mailtoHref(snap.settings.email, `${snap.settings.businessName} report: ${rangeText}`, summary)}><Icon name="mail" size={16} /> Email me</a>
          : <button className="btn" onClick={() => toast('Add your email in Settings')}><Icon name="mail" size={16} /> Email me</button>}
        <button className="btn btn-outline" onClick={exportCsv}><Icon name="download" size={16} /> Export CSV</button>
      </div>
      <p className="small center">Weekly, biweekly and monthly reports also email you on their own once email is set up. The CSV export is handy at tax time.</p>
    </div>
  );
}
