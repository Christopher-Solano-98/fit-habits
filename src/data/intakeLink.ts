import { useEffect, useRef } from 'react';
import type { Client, Settings } from '@shared/types.ts';
import { useStore } from './store';
import { getConnection } from './connection';
import { nowIso, uid } from './repo';

/** Public link to a client's intake form (PAR-Q, medical, ID, waiver). */
export function intakeUrl(token: string): string {
  const conn = getConnection();
  return `${location.origin}${location.pathname}#/intake/${token}${conn ? `?api=${encodeURIComponent(conn.api)}` : ''}`;
}

export function intakeMessage(c: Client, s: Pick<Settings, 'businessName'>, link: string): string {
  return `Hi ${c.firstName}, please fill out your ${s.businessName} intake form before our next session (health questions, medical history, ID and waiver). It takes about 5 minutes: ${link}`;
}

/**
 * The client's open intake link, made ahead of time when they don't have one yet.
 * iPhone only opens Messages straight from a tap, so the link has to exist before
 * the tap rather than be saved first and opened after.
 * Returns null once they've completed one (send a new form from Files instead).
 */
export function useIntakeLink(c: Client | undefined): { token: string; url: string } | null {
  const { snap, save } = useStore();
  const mine = c ? snap.intakes.filter((i) => i.clientId === c.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) : [];
  const latest = mine[0];
  // Links stop working after 21 days (Apps Script INTAKE_MAX_DAYS); swap in a fresh one well before that.
  const fresh = latest && !latest.completedAt && Date.now() - new Date(latest.createdAt).getTime() < 14 * 864e5;
  const pending = fresh ? latest : null;
  const needNew = !!c && (!latest || (!latest.completedAt && !fresh));
  const made = useRef<string | null>(null);
  useEffect(() => {
    if (!c || !needNew || made.current === c.id) return;
    made.current = c.id;
    save('intakes', { id: uid(), clientId: c.id, token: uid().replace(/-/g, ''), createdAt: nowIso(), completedAt: null, answers: null });
  }, [c, needNew, save]);
  return pending ? { token: pending.token, url: intakeUrl(pending.token) } : null;
}
