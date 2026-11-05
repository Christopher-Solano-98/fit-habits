import type { Client } from '@shared/types.ts';

/** "6:00 AM" -> minutes since midnight, for sorting today's sessions. */
export function timeToMinutes(t: string | null): number {
  const m = t?.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!m) return 24 * 60;
  let h = Number(m[1]) % 12;
  if (m[3]?.toLowerCase() === 'pm') h += 12;
  return h * 60 + Number(m[2] ?? 0);
}

export function fullName(c: Client): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

export function money(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function byName(a: Client, b: Client): number {
  return fullName(a).localeCompare(fullName(b));
}

export function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}
