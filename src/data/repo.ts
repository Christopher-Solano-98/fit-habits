import type { ClientFile, FileKind, Settings, Snapshot, TableName } from '@shared/types.ts';

export type Row<T extends TableName> = Snapshot[T][number];

export interface NoticeRequest {
  clientId: string;
  channel: 'text' | 'email' | 'both';
  subject: string;
  body: string;
}

export interface Sent { text: boolean; email: boolean }

export interface Repo {
  mode: 'demo' | 'cloud' | 'sheets';
  load(): Promise<Snapshot>;
  put<T extends TableName>(table: T, row: Row<T>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  uploadFile(clientId: string, kind: FileKind, file: File): Promise<ClientFile>;
  fileUrl(f: ClientFile): Promise<string>;
  deleteFile(f: ClientFile): Promise<void>;
  /** Sends a text/email from the server; reports which ones actually went out. */
  sendNotice(n: NoticeRequest): Promise<Sent>;
  reset(withSamples: boolean): Promise<void>;
}

export function uid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
