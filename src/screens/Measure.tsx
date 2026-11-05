import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Measurement, MetricKey } from '@shared/types.ts';
import { fmtValue, METRIC_GROUPS, METRICS, parseValue, series } from '@shared/metrics.ts';
import { useStore } from '../data/store';
import { nowIso, uid } from '../data/repo';
import { Header } from '../components/ui';
import { Icon } from '../components/Icon';

export function Measure() {
  const { id, mid } = useParams();
  const { client, snap, save, del, repo, reload, toast, today } = useStore();
  const nav = useNavigate();
  const c = client(id!);
  const existing = mid ? snap.measurements.find((m) => m.id === mid) : undefined;
  const [date, setDate] = useState(existing?.takenOn ?? today);
  const [note, setNote] = useState(existing?.note ?? '');
  const [raw, setRaw] = useState<Partial<Record<MetricKey, string>>>(() =>
    Object.fromEntries(Object.entries(existing?.values ?? {}).map(([k, v]) => [k, fmtValue(k as MetricKey, v as number).replace(/ .*$/, '').replace('%', '')])));
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  if (!c) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const values: Measurement['values'] = {};
    for (const m of METRICS) {
      const v = parseValue(m.key, raw[m.key] ?? '');
      if (v !== null) values[m.key] = v;
    }
    if (!Object.keys(values).length) return toast('Enter at least one measurement');
    let fileId = existing?.fileId ?? null;
    if (file) {
      const f = await repo.uploadFile(c.id, 'scan', file);
      fileId = f.id;
      await reload();
    }
    await save('measurements', { id: existing?.id ?? uid(), clientId: c.id, takenOn: date, values, note: note || null, fileId, createdAt: existing?.createdAt ?? nowIso() });
    toast('Measurements saved');
    nav(`/clients/${c.id}?tab=progress`, { replace: true });
  };

  return (
    <form className="page form" onSubmit={submit}>
      <Header title={existing ? 'Edit measurements' : 'New measurements'} sub={`${c.firstName} ${c.lastName}`} back />
      <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value || today)} /></label>
      <p className="small">Fill in only what you measured. Leave the rest blank.</p>
      {METRIC_GROUPS.map((g) => (
        <fieldset key={g}>
          <legend>{g}</legend>
          <div className="grid2">
            {METRICS.filter((m) => m.group === g).map((m) => {
              const prev = series(snap.measurements, c.id, m.key).filter((p) => p.date < date).pop();
              return (
                <label key={m.key}>
                  {m.label}{m.time ? ' (m:ss)' : m.unit ? ` (${m.unit})` : ''}
                  <input inputMode={m.time ? 'text' : 'decimal'} placeholder={prev ? `last ${fmtValue(m.key, prev.value)}` : ''} value={raw[m.key] ?? ''} onChange={(e) => setRaw((r) => ({ ...r, [m.key]: e.target.value }))} />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend>Scan report</legend>
        <input ref={fileInput} type="file" hidden accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="btn btn-outline btn-block" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" size={16} /> {file ? file.name : existing?.fileId ? 'Replace attached report' : 'Attach scan PDF or photo'}
        </button>
        <label>Notes<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </fieldset>
      <button className="btn btn-block" type="submit">Save</button>
      {existing && <button type="button" className="btn-ghost danger" onClick={async () => { if (confirm('Delete these measurements?')) { await del('measurements', existing.id); nav(-1); } }}>Delete</button>}
    </form>
  );
}
