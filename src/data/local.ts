import type { ClientFile, FileKind, Settings, Snapshot, TableName } from '@shared/types.ts';
import { nowIso, uid, type Repo, type Row } from './repo';
import { emptySnapshot, sampleSnapshot } from './samples';
import { IS_SAMPLE } from '../lib/space';

// Demo mode: everything lives in this browser. Records go in localStorage,
// uploaded files in IndexedDB (localStorage is too small for photos and PDFs).
// v2: the main app starts with a clean slate (v1 started with sample clients).
const KEY = IS_SAMPLE ? 'fithabits.sample.v2' : 'fithabits.demo.v2';

function read(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

function write(s: Snapshot) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

function blobs(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IS_SAMPLE ? 'fithabits-sample-files' : 'fithabits-files', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function blobOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await blobs();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('files', mode).objectStore('files'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Mirrors the database's ON DELETE CASCADE for a deleted client. */
export function dropClientRows(s: Snapshot, clientId: string) {
  s.payments = s.payments.filter((r) => r.clientId !== clientId);
  s.measurements = s.measurements.filter((r) => r.clientId !== clientId);
  s.goals = s.goals.filter((r) => r.clientId !== clientId);
  s.files = s.files.filter((r) => r.clientId !== clientId);
  s.intakes = s.intakes.filter((r) => r.clientId !== clientId);
}

export function localRepo(): Repo {
  let snap = read() ?? (IS_SAMPLE ? sampleSnapshot() : emptySnapshot());
  write(snap);

  const mutate = (fn: (s: Snapshot) => void) => {
    snap = structuredClone(snap);
    fn(snap);
    write(snap);
  };

  return {
    mode: 'demo',
    async load() {
      return structuredClone(snap);
    },
    async put<T extends TableName>(table: T, row: Row<T>) {
      mutate((s) => {
        const list = s[table] as Row<T>[];
        const i = list.findIndex((r) => r.id === row.id);
        if (i >= 0) list[i] = row;
        else list.push(row);
      });
    },
    async remove(table, id) {
      mutate((s) => {
        (s[table] as { id: string }[]) = (s[table] as { id: string }[]).filter((r) => r.id !== id);
        if (table === 'clients') dropClientRows(s, id);
      });
    },
    async saveSettings(settings: Settings) {
      mutate((s) => { s.settings = settings; });
    },
    async uploadFile(clientId: string, kind: FileKind, file: File) {
      const id = uid();
      await blobOp('readwrite', (s) => s.put(file, id));
      const row: ClientFile = { id, clientId, kind, name: file.name, path: id, mime: file.type, size: file.size, createdAt: nowIso() };
      mutate((s) => { s.files.push(row); });
      return row;
    },
    async fileUrl(f) {
      const blob = await blobOp<Blob | undefined>('readonly', (s) => s.get(f.path));
      if (!blob) throw new Error('File not found on this device');
      return URL.createObjectURL(blob);
    },
    async deleteFile(f) {
      await blobOp('readwrite', (s) => s.delete(f.path));
      mutate((s) => { s.files = s.files.filter((x) => x.id !== f.id); });
    },
    async sendNotice() {
      return { text: false, email: false };
    },
    async reset(withSamples) {
      await blobOp('readwrite', (s) => s.clear());
      snap = withSamples ? sampleSnapshot() : emptySnapshot();
      write(snap);
    },
  };
}
