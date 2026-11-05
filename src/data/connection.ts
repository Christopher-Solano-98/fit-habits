// Link between the phone app and the trainer's Apps Script backend.
// The connection code (made by connectionCode() in Apps Script) is base64 of
// {api, key}. It's stored on this device only; the key unlocks client data.

export interface Connection { api: string; key: string }

const KEY = 'fithabits.connection.v1';

export function getConnection(): Connection | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return c?.api && c?.key ? c : null;
  } catch {
    return null;
  }
}

export function parseConnectionCode(code: string): Connection {
  const b64 = code.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  let c: Partial<Connection>;
  try {
    c = JSON.parse(atob(b64));
  } catch {
    throw new Error("That code doesn't look right. Copy the whole code from Apps Script.");
  }
  if (!c.api?.startsWith('https://script.google.com/') || !c.key) throw new Error("That code doesn't look right. Copy the whole code from Apps Script.");
  return { api: c.api, key: c.key };
}

export function saveConnection(c: Connection | null) {
  if (c) localStorage.setItem(KEY, JSON.stringify(c));
  else localStorage.removeItem(KEY);
}

/** POST as text/plain so the browser skips the CORS preflight Apps Script can't answer. */
export async function gasCall<T>(api: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(api, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = (await res.json()) as { result?: T; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result as T;
}

/** Shrinks photos before upload (phone photos are 3–8 MB); PDFs pass through. */
export async function fileToBase64(file: File): Promise<{ data: string; mime: string; name: string }> {
  let blob: Blob = file;
  let mime = file.type || 'application/octet-stream';
  let name = file.name;
  if (/^image\/(jpeg|png|heic|heif|webp)$/.test(file.type)) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('resize failed'))), 'image/jpeg', 0.85));
      mime = 'image/jpeg';
      name = name.replace(/\.\w+$/, '') + '.jpg';
    } catch {
      /* keep the original if the browser can't decode it */
    }
  }
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { data: btoa(bin), mime, name };
}
