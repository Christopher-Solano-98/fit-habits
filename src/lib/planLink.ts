// A client's plan travels inside the link itself (compressed), so it opens on
// any phone with no login and no server: perfect for texting a plan.

export interface PlanPayload {
  v: 1;
  b: string; // business
  t: string; // trainer
  c: string; // client first name
  n: string; // program name
  s: string | null; // start date
  w: number; // weeks per phase
  ph: { l: string; no: string }[];
  d: { n: string; i: { e: string; u: string; p: string[] }[] }[]; // days → exercises (name, how-to url, plan per phase)
}

const b64url = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodePlan(p: PlanPayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream !== 'undefined') return 'z' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j' + b64url(json);
}

export async function decodePlan(s: string): Promise<PlanPayload> {
  const kind = s[0], body = fromB64url(s.slice(1));
  const bytes = kind === 'z' ? await pipe(body, new DecompressionStream('deflate-raw')) : body;
  const p = JSON.parse(new TextDecoder().decode(bytes)) as PlanPayload;
  if (p.v !== 1 || !Array.isArray(p.d)) throw new Error('bad plan');
  return p;
}
