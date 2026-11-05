import { useState } from 'react';
import { Link } from 'react-router-dom';
import { scheduleText } from '@shared/messages.ts';
import { useStore } from '../data/store';
import { Avatar, Empty, Header, Pill, Seg } from '../components/ui';
import { Icon } from '../components/Icon';
import { byName, fullName } from '../lib/util';

export function Clients() {
  const { snap, status } = useStore();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'all'>('active');
  const list = snap.clients
    .filter((c) => (show === 'all' || c.active) && fullName(c).toLowerCase().includes(q.trim().toLowerCase()))
    .sort(byName);
  const activeCount = snap.clients.filter((c) => c.active).length;

  return (
    <div className="page">
      <Header
        title="Clients"
        sub={`${activeCount} active`}
        action={<Link to="/clients/new" className="btn btn-dark"><Icon name="plus" size={16} stroke={2.4} /> Add client</Link>}
      />
      <label className="search">
        <Icon name="search" size={16} />
        <span className="sr">Search clients</span>
        <input type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {snap.clients.some((c) => !c.active) && <Seg value={show} options={[['active', 'Active'], ['all', 'All']]} onChange={setShow} />}
      {list.length === 0 && <Empty>{snap.clients.length ? 'No one matches that search.' : 'No clients yet. Tap "Add client" to load the people you train.'}</Empty>}
      <div className="stack">
        {list.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`} className="card row row-link client-row">
            <Avatar c={c} />
            <span className="grow">
              <strong>{fullName(c)}{!c.active && <span className="muted"> · inactive</span>}</strong>
              <span className="small">{scheduleText(c)}</span>
            </span>
            <Pill status={status(c)} short />
          </Link>
        ))}
      </div>
    </div>
  );
}
