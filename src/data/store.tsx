import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Client, Settings, Snapshot, TableName } from '@shared/types.ts';
import { payStatus, type PayStatus } from '@shared/billing.ts';
import { todayIso } from '@shared/dates.ts';
import type { Repo, Row } from './repo';
import { dropClientRows } from './local';

interface Store {
  repo: Repo;
  snap: Snapshot;
  today: string;
  status: (c: Client) => PayStatus;
  client: (id: string) => Client | undefined;
  save: <T extends TableName>(table: T, row: Row<T>) => Promise<void>;
  del: (table: TableName, id: string) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  reload: () => Promise<void>;
  toast: (msg: string) => void;
  toastMsg: string;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export function StoreProvider({ repo, children }: { repo: Repo; children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const timer = useRef<number>();
  const today = todayIso();

  const toast = useCallback((msg: string) => {
    window.clearTimeout(timer.current);
    setToastMsg(msg);
    timer.current = window.setTimeout(() => setToastMsg(''), 2800);
  }, []);

  const reload = useCallback(async () => {
    try {
      setSnap(await repo.load());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [repo]);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async <T extends TableName>(table: T, row: Row<T>) => {
    // Optimistic: update the screen first, then persist; reload on failure.
    setSnap((s) => {
      if (!s) return s;
      const list = [...(s[table] as Row<T>[])];
      const i = list.findIndex((r) => r.id === row.id);
      if (i >= 0) list[i] = row; else list.push(row);
      return { ...s, [table]: list };
    });
    try {
      await repo.put(table, row);
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`);
      reload();
    }
  }, [repo, reload, toast]);

  const del = useCallback(async (table: TableName, id: string) => {
    setSnap((s) => {
      if (!s) return s;
      const next = { ...s, [table]: (s[table] as { id: string }[]).filter((r) => r.id !== id) } as Snapshot;
      if (table === 'clients') dropClientRows(next, id);
      return next;
    });
    try {
      await repo.remove(table, id);
    } catch (e) {
      toast(`Couldn't delete: ${(e as Error).message}`);
      reload();
    }
  }, [repo, reload, toast]);

  const saveSettings = useCallback(async (settings: Settings) => {
    setSnap((s) => (s ? { ...s, settings } : s));
    try {
      await repo.saveSettings(settings);
    } catch (e) {
      toast(`Couldn't save settings: ${(e as Error).message}`);
      reload();
    }
  }, [repo, reload, toast]);

  const value = useMemo<Store | null>(() => {
    if (!snap) return null;
    return {
      repo, snap, today, save, del, saveSettings, reload, toast, toastMsg,
      status: (c) => payStatus(c, snap.payments, today),
      client: (id) => snap.clients.find((c) => c.id === id),
    };
  }, [repo, snap, today, save, del, saveSettings, reload, toast, toastMsg]);

  if (error && !snap) {
    return (
      <div className="center-screen">
        <p className="muted">Couldn't load your data.</p>
        <p className="small">{error}</p>
        <button className="btn" onClick={reload}>Try again</button>
      </div>
    );
  }
  if (!value) return <div className="center-screen"><p className="muted">Loading…</p></div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
