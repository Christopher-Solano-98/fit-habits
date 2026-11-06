import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { Client } from '@shared/types.ts';
import type { PayStatus } from '@shared/billing.ts';
import { fillTemplate, smsHref } from '@shared/messages.ts';
import { useStore } from '../data/store';
import { Icon } from './Icon';

export function Pill({ status, short }: { status: PayStatus; short?: boolean }) {
  const text = short && status.state === 'paid' ? 'Paid' : status.label;
  return <span className={`pill pill-${status.state}`}>{text}</span>;
}

export function Avatar({ c, size = 44 }: { c: Client; size?: number }) {
  const initials = (c.firstName[0] ?? '') + (c.lastName[0] ?? '');
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials.toUpperCase()}</span>;
}

export function Header({ title, sub, back, action, help }: { title: string; sub?: ReactNode; back?: boolean; action?: ReactNode; help?: string }) {
  const nav = useNavigate();
  return (
    <header className="header">
      {back && (
        <button className="back" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))}>
          <Icon name="back" /> Back
        </button>
      )}
      <div className="header-row">
        <div className="header-text">
          {title && <h1>{title}</h1>}
          {sub && <div className="sub">{sub}</div>}
        </div>
        {(action || help) && (
          <div className="header-actions">
            {help && <HelpButton topic={help} />}
            {action}
          </div>
        )}
      </div>
    </header>
  );
}

export function HelpButton({ topic }: { topic: string }) {
  return <Link to={`/help?topic=${topic}`} className="icon-btn help-btn" aria-label="Help"><Icon name="help" /></Link>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Seg<T extends string>({ value, options, onChange, dark }: { value: T; options: [T, string][]; onChange: (v: T) => void; dark?: boolean }) {
  return (
    <div className={`seg${dark ? ' seg-dark' : ''}`} role="group">
      {options.map(([v, label]) => (
        <button type="button" key={v} aria-pressed={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className={`toggle${on ? ' on' : ''}`} aria-pressed={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function TabBar() {
  const tab = (to: string, icon: string, label: string) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </NavLink>
  );
  return (
    <nav className="tabbar" aria-label="Main">
      {tab('/', 'home', 'Home')}
      {tab('/clients', 'users', 'Clients')}
      <NavLink to="/log" className="tab tab-log" aria-label="Log a payment">
        <span className="tab-log-btn"><Icon name="plus" size={24} stroke={2.6} /></span>
      </NavLink>
      {tab('/messages', 'chat', 'Messages')}
      {tab('/reports', 'chart', 'Reports')}
    </nav>
  );
}

export function Toast() {
  const { toastMsg } = useStore();
  if (!toastMsg) return null;
  return <div className="toast" role="status">{toastMsg}</div>;
}

/** Bottom sheet of saved replies; tapping one opens the phone's Messages app pre-filled. */
export function QuickText({ client, onClose }: { client: Client; onClose: () => void }) {
  const { snap } = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const templates = [...snap.templates].sort((a, b) => a.sort - b.sort);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={`Text ${client.firstName}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Text {client.firstName}</strong>
          <span className="small">{client.phone}</span>
        </div>
        {!client.phone && <p className="muted">Add a phone number to {client.firstName}'s profile first.</p>}
        {client.phone && templates.map((t) => {
          const body = fillTemplate(t.body, client, snap.settings);
          return (
            <a key={t.id} className="reply" href={smsHref(client.phone!, body)} onClick={() => setTimeout(onClose, 300)}>
              <strong>{t.title}</strong>
              <span>{body}</span>
            </a>
          );
        })}
        {client.phone && <a className="reply reply-blank" href={smsHref(client.phone, '')}>Write your own…</a>}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
