import type { ClientFile, Snapshot } from '@shared/types.ts';
import { defaultMotivations, defaultSettings, defaultTemplates } from './defaults';
import { fileToBase64, gasCall, type Connection } from './connection';
import type { Repo } from './repo';

// Google Apps Script backend: Google Sheet for records, Drive for files,
// Gmail for email. See apps-script/Code.js.
export function gasRepo(conn: Connection): Repo {
  const call = <T>(action: string, payload: Record<string, unknown> = {}) => gasCall<T>(conn.api, { action, key: conn.key, ...payload });

  return {
    mode: 'sheets',
    async load() {
      const snap = await call<Snapshot & { settings: Snapshot['settings'] | null }>('load');
      // A brand-new sheet: seed settings, quick replies and the motivation library.
      if (!snap.settings) {
        snap.settings = defaultSettings();
        await call('saveSettings', { settings: snap.settings });
        if (!snap.templates.length) {
          snap.templates = defaultTemplates();
          for (const row of snap.templates) await call('put', { table: 'templates', row });
        }
        if (!snap.motivations.length) {
          snap.motivations = defaultMotivations();
          for (const row of snap.motivations) await call('put', { table: 'motivations', row });
        }
      }
      snap.settings = { ...defaultSettings(), ...snap.settings };
      snap.exercises ??= [];
      snap.exerciseLogs ??= [];
      return snap;
    },
    async put(table, row) {
      await call('put', { table, row });
    },
    async remove(table, id) {
      await call('remove', { table, id });
    },
    async saveSettings(settings) {
      await call('saveSettings', { settings });
    },
    async uploadFile(clientId, kind, file) {
      const f = await fileToBase64(file);
      return call<ClientFile>('upload', { clientId, kind, ...f });
    },
    async fileUrl(f) {
      const r = await call<{ mime: string; data: string }>('file', { id: f.id });
      const bytes = Uint8Array.from(atob(r.data), (ch) => ch.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: r.mime }));
    },
    async deleteFile(f) {
      await call('deleteFile', { id: f.id });
    },
    async sendNotice(n) {
      try {
        return await call<{ text: boolean; email: boolean }>('notify', { ...n });
      } catch {
        return { text: false, email: false };
      }
    },
    async reset() {
      throw new Error('Reset is only available in demo mode');
    },
  };
}
