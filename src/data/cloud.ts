import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientFile, FileKind, Settings, Snapshot, TableName } from '@shared/types.ts';
import { defaultSettings } from './defaults';
import { nowIso, uid, type Repo, type Row } from './repo';

// Cloud mode: Supabase Postgres + private Storage bucket, protected by row-level
// security so only the signed-in trainer can read or write anything.
// App objects are camelCase; columns are snake_case. Only top-level keys are
// converted, so jsonb columns (values, answers, motivation…) keep their shape.

const TABLES: TableName[] = ['clients', 'payments', 'measurements', 'goals', 'files', 'templates', 'motivations', 'intakes', 'exercises', 'exerciseLogs'];
const BUCKET = 'client-files';

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const tableName = (t: TableName) => toSnake(t);
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function outRow(row: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toSnake(k), v]));
}

function inRow<T>(row: Record<string, unknown>): T {
  const o = Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'owner_id').map(([k, v]) => [toCamel(k), v]));
  return o as T;
}

export function cloudRepo(sb: SupabaseClient): Repo {
  const check = <T>(res: { data: T; error: { message: string } | null }): T => {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  };

  return {
    mode: 'cloud',
    async load() {
      const [settingsRes, ...rest] = await Promise.all([
        sb.from('settings').select('*').maybeSingle(),
        ...TABLES.map((t) => sb.from(tableName(t)).select('*')),
      ]);
      const settingsRow = check(settingsRes);
      const snap = { settings: settingsRow ? { ...defaultSettings(), ...inRow<Settings>(settingsRow) } : defaultSettings() } as Snapshot;
      TABLES.forEach((t, i) => {
        (snap[t] as unknown[]) = (check(rest[i]) as Record<string, unknown>[]).map((r) => inRow(r));
      });
      if (!settingsRow) await this.saveSettings(snap.settings);
      return snap;
    },
    async put<T extends TableName>(table: T, row: Row<T>) {
      check(await sb.from(tableName(table)).upsert(outRow(row)));
    },
    async remove(table, id) {
      check(await sb.from(tableName(table)).delete().eq('id', id));
    },
    async saveSettings(s: Settings) {
      const { id: _id, ...rest } = s;
      check(await sb.from('settings').upsert(outRow(rest), { onConflict: 'owner_id' }));
    },
    async uploadFile(clientId: string, kind: FileKind, file: File) {
      const { data: auth } = await sb.auth.getUser();
      const id = uid();
      const safe = file.name.replace(/[^\w.-]+/g, '_');
      const path = `${auth.user!.id}/${clientId}/${id}-${safe}`;
      check(await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false }));
      const row: ClientFile = { id, clientId, kind, name: file.name, path, mime: file.type, size: file.size, createdAt: nowIso() };
      await this.put('files', row);
      return row;
    },
    async fileUrl(f) {
      // Short-lived link: medical records and IDs are never publicly reachable.
      const data = check(await sb.storage.from(BUCKET).createSignedUrl(f.path, 120));
      if (!data) throw new Error('Could not open file');
      return data.signedUrl;
    },
    async deleteFile(f) {
      check(await sb.storage.from(BUCKET).remove([f.path]));
      await this.remove('files', f.id);
    },
    async sendNotice(n) {
      const { data, error } = await sb.functions.invoke('notify', { body: n });
      const d = (error ? null : data) as { text?: boolean; email?: boolean } | null;
      return { text: !!d?.text, email: !!d?.email };
    },
    async reset() {
      throw new Error('Reset is only available in demo mode');
    },
  };
}
