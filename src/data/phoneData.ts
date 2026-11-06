import type { Snapshot, TableName } from '@shared/types.ts';
import { DEFAULT_WAIVER } from '@shared/waiver.ts';
import type { Repo } from './repo';
import { IS_SAMPLE } from '../lib/space';
import { LOCAL_KEY, readLocalBlob, readLocalSnapshot } from './local';

// Records typed in before a phone was connected stay in that phone's browser storage
// (and on iPhone, Safari and the Home Screen icon each keep their own). Once the phone
// is connected, this finds them so they can be copied into the Google Sheet.

// Clients first so everything that points at a client lands after it.
const ORDER: TableName[] = ['clients', 'exercises', 'workouts', 'payments', 'measurements', 'goals', 'intakes', 'exerciseLogs', 'sessions', 'programs', 'templates', 'motivations'];

export interface PhoneOnly {
  local: Snapshot;
  rows: { table: TableName; row: { id: string } }[];
  files: Snapshot['files'];
  waiver: string | null;
  clients: number;
  payments: number;
  total: number;
}

export function phoneOnlyData(sheet: Snapshot): PhoneOnly | null {
  if (IS_SAMPLE) return null;
  const local = readLocalSnapshot();
  if (!local) return null;
  const rows: PhoneOnly['rows'] = [];
  for (const table of ORDER) {
    const have = new Set(((sheet[table] ?? []) as { id: string }[]).map((r) => r.id));
    let mine = ((local[table] ?? []) as { id: string }[]).filter((r) => !have.has(r.id));
    // Starter quick replies and messages get fresh ids on every device; match them by text.
    if (table === 'templates') {
      const bodies = new Set(sheet.templates.map((t) => t.body.trim()));
      mine = mine.filter((r) => !bodies.has((r as Snapshot['templates'][number]).body.trim()));
    }
    if (table === 'motivations') {
      const bodies = new Set(sheet.motivations.map((t) => t.body.trim()));
      mine = mine.filter((r) => !bodies.has((r as Snapshot['motivations'][number]).body.trim()));
    }
    // Rows for a client that isn't coming along would point at nothing.
    const clientIds = new Set([...sheet.clients.map((c) => c.id), ...local.clients.map((c) => c.id)]);
    mine = mine.filter((r) => !('clientId' in r) || clientIds.has((r as { clientId: string }).clientId));
    for (const row of mine) rows.push({ table, row });
  }
  const haveFiles = new Set(sheet.files.map((f) => f.id));
  const files = local.files.filter((f) => !haveFiles.has(f.id));
  const lw = local.settings?.waiverText?.trim();
  const waiver = lw && lw !== DEFAULT_WAIVER.trim() && sheet.settings.waiverText.trim() === DEFAULT_WAIVER.trim() ? local.settings.waiverText : null;
  // Only starter quick replies/messages (no clients, payments etc.)? Nothing worth moving.
  const real = rows.filter((r) => r.table !== 'templates' && r.table !== 'motivations').length + files.length + (waiver ? 1 : 0);
  if (!real) return null;
  return {
    local, rows, files, waiver,
    clients: rows.filter((r) => r.table === 'clients').length,
    payments: rows.filter((r) => r.table === 'payments').length,
    total: rows.length + files.length,
  };
}

/** Copies the phone-only records (and files) into the Sheet, then keeps a backup copy aside on the phone. */
export async function moveToSheet(repo: Repo, sheet: Snapshot, found: PhoneOnly, progress: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  const step = () => progress(++done, found.total);
  const tables = (t: TableName) => found.rows.filter((r) => r.table === t);
  const fileIds = new Map<string, string>();

  for (const { row } of tables('clients')) { await repo.put('clients', row as never); step(); }
  for (const f of found.files) {
    const blob = await readLocalBlob(f.path);
    if (blob) {
      const up = await repo.uploadFile(f.clientId, f.kind, new File([blob], f.name, { type: f.mime || blob.type }));
      fileIds.set(f.id, up.id);
    }
    step();
  }
  for (const table of ORDER.filter((t) => t !== 'clients')) {
    for (const { row } of tables(table)) {
      let r = row as Record<string, unknown>;
      if (table === 'measurements' && typeof r.fileId === 'string') r = { ...r, fileId: fileIds.get(r.fileId) ?? null };
      await repo.put(table, r as never);
      step();
    }
  }
  if (found.waiver) await repo.saveSettings({ ...sheet.settings, waiverText: found.waiver });
  setAside();
}

/** Stop offering to move it, keeping a copy on the phone just in case. */
export function setAside() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) localStorage.setItem(`${LOCAL_KEY}.moved-${new Date().toISOString().slice(0, 10)}`, raw);
    localStorage.removeItem(LOCAL_KEY);
  } catch { /* storage unavailable */ }
}
