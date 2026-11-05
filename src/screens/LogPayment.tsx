import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Channel, Payment, PayMethod } from '@shared/types.ts';
import { fmtLong } from '@shared/dates.ts';
import { mailtoHref, receiptText, smsHref } from '@shared/messages.ts';
import { useStore } from '../data/store';
import { nowIso, uid } from '../data/repo';
import { Header, Seg } from '../components/ui';
import { Icon } from '../components/Icon';
import { byName, money } from '../lib/util';

export function LogPayment() {
  const { snap, save, client, today, repo, status, toast } = useStore();
  const [params] = useSearchParams();
  const clients = snap.clients.filter((c) => c.active).sort(byName);
  const [cid, setCid] = useState(params.get('client') ?? clients[0]?.id ?? '');
  const c = client(cid);
  const [amount, setAmount] = useState(() => String(c ? status(c).owed || c.rate : ''));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ p: Payment; auto: boolean } | null>(null);

  const pickClient = (id: string) => {
    setCid(id);
    const x = client(id);
    if (x) setAmount(String(status(x).owed || x.rate));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!c || !(n > 0)) return toast('Pick a client and enter an amount');
    const p: Payment = { id: uid(), clientId: c.id, amount: n, paidOn, method, note: note || null, receiptVia: c.channel, createdAt: nowIso() };
    await save('payments', p);
    let auto = false;
    if (c.channel !== 'none') {
      auto = await repo.sendNotice({ clientId: c.id, channel: c.channel, subject: `${snap.settings.businessName} receipt`, body: receiptText(c, p, snap.settings) });
    }
    setDone({ p, auto });
  };

  if (!clients.length) {
    return <div className="page"><Header title="Log a payment" /><div className="empty">Add a client first. <Link to="/clients/new">Add client</Link></div></div>;
  }

  if (done && c) {
    const text = receiptText(c, done.p, snap.settings);
    const via: Channel = c.channel;
    return (
      <div className="page done">
        <span className="done-check"><Icon name="check" size={38} stroke={2.6} /></span>
        <h1 className="display">Payment logged</h1>
        <p>{money(done.p.amount)} from {c.firstName} {c.lastName} · {fmtLong(done.p.paidOn)}</p>
        <div className="card pad receipt">
          <span className="small upper">{via === 'none' ? 'Receipt (not sent: client opted out)' : done.auto ? `Receipt sent automatically by ${via === 'both' ? 'text and email' : via}` : 'Send the receipt'}</span>
          <div className="bubble">{text}</div>
          {!done.auto && via !== 'none' && (
            <div className="grid2">
              {c.phone && via !== 'email' && <a className="btn" href={smsHref(c.phone, text)}>Text receipt</a>}
              {c.email && via !== 'text' && <a className="btn btn-dark" href={mailtoHref(c.email, `${snap.settings.businessName} receipt`, text)}>Email receipt</a>}
            </div>
          )}
          {!done.auto && via !== 'none' && repo.mode === 'demo' && <span className="small">Once texting and email are set up, receipts send on their own.</span>}
        </div>
        <div className="grid2">
          <button className="btn btn-outline" onClick={() => { setDone(null); setNote(''); }}>Log another</button>
          <Link className="btn btn-dark" to={`/clients/${c.id}?tab=pay`}>Done</Link>
        </div>
      </div>
    );
  }

  const quick = Array.from(new Set([c?.rate, c && status(c).owed, 50, 75, 100, 150].filter((x): x is number => !!x && x > 0))).slice(0, 5);

  return (
    <form className="page form" onSubmit={submit}>
      <Header title="Log a payment" />
      <label>Client</label>
      <div className="chips">
        {clients.map((x) => (
          <button type="button" key={x.id} className={`chip chip-lg${x.id === cid ? ' on' : ''}`} aria-pressed={x.id === cid} onClick={() => pickClient(x.id)}>
            {x.firstName}{clients.filter((y) => y.firstName === x.firstName).length > 1 ? ` ${x.lastName[0] ?? ''}.` : ''}
          </button>
        ))}
      </div>
      {c && <p className="small">{c.firstName}: {status(c).label}{status(c).owed ? ` · ${money(status(c).owed)} open` : ''}</p>}

      <label>Amount ($)
        <input className="amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <div className="chips">
        {quick.map((q) => <button type="button" key={q} className={`chip${Number(amount) === q ? ' on' : ''}`} onClick={() => setAmount(String(q))}>${q}</button>)}
      </div>

      <label>Paid with</label>
      <Seg<PayMethod> value={method} options={[['cash', 'Cash'], ['zelle', 'Zelle'], ['cashapp', 'Cash App'], ['venmo', 'Venmo'], ['other', 'Other']]} onChange={setMethod} />

      <div className="grid2">
        <label>Date<input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value || today)} /></label>
        <label>Note<input value={note} placeholder="Optional" onChange={(e) => setNote(e.target.value)} /></label>
      </div>

      <button className="btn btn-block btn-lg" type="submit">Log {amount ? money(Number(amount)) : 'payment'}{c ? ` from ${c.firstName}` : ''}</button>
    </form>
  );
}
