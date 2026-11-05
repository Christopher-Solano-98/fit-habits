import { useState } from 'react';
import type { Settings as S } from '@shared/types.ts';
import { useStore } from '../data/store';
import { DEFAULT_WAIVER } from '@shared/waiver.ts';
import { IS_SAMPLE } from '../lib/space';
import { supabase } from '../data/supabase';
import { parseConnectionCode, saveConnection } from '../data/connection';
import { Header } from '../components/ui';

export function Settings() {
  const { snap, saveSettings, repo, reload, toast } = useStore();
  const [s, setS] = useState<S>(snap.settings);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const connect = () => {
    try {
      saveConnection(parseConnectionCode(code));
      location.hash = '#/';
      location.reload();
    } catch (e) {
      setCodeErr((e as Error).message);
    }
  };
  const field = (k: 'trainerName' | 'businessName' | 'email' | 'phone') => ({ value: s[k], onChange: (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value }) });

  return (
    <div className="page form">
      <Header title="Settings" back />
      <fieldset>
        <legend>You</legend>
        <label>Your name (used in messages)<input {...field('trainerName')} /></label>
        <label>Business name<input {...field('businessName')} /></label>
        <label>Your email (reports and alerts)<input type="email" {...field('email')} /></label>
        <label>Your mobile (test messages)<input type="tel" {...field('phone')} /></label>
        <button className="btn btn-block" onClick={() => { saveSettings(s); toast('Saved'); }}>Save</button>
      </fieldset>

      <fieldset>
        <legend>Your waiver</legend>
        <p className="small">Clients read this on the intake form and sign it by typing their name. Each signed copy is saved to that client's Files → Waiver. Leave a blank line between paragraphs.</p>
        <textarea rows={8} value={s.waiverText} onChange={(e) => setS({ ...s, waiverText: e.target.value })} />
        <button className="btn btn-block" onClick={() => { saveSettings({ ...s, waiverText: s.waiverText.trim() || DEFAULT_WAIVER }); toast('Waiver saved'); }}>Save waiver</button>
      </fieldset>

      <fieldset>
        <legend>Add to Home Screen</legend>
        <p className="small"><strong>iPhone:</strong> open this page in Safari, tap the Share button, then "Add to Home Screen".</p>
        <p className="small"><strong>Android:</strong> open in Chrome, tap the ⋮ menu, then "Install app" or "Add to Home screen".</p>
      </fieldset>

      <fieldset>
        <legend>Data</legend>
        {IS_SAMPLE ? (
          <>
            <p className="small">This is the practice copy, filled with fake clients. Nothing here reaches the real app. Reset it any time.</p>
            <button className="btn btn-outline btn-block" onClick={async () => { if (confirm('Reset the practice copy back to the original fake clients?')) { await repo.reset(true); await reload(); toast('Practice data reset'); } }}>Reset practice data</button>
          </>
        ) : repo.mode === 'demo' ? (
          <>
            <p className="small">Everything is saved on this phone only. Connect your Google Sheet to back it up and turn on automatic emails.</p>
            <label>Connection code (from Apps Script)<textarea rows={3} value={code} onChange={(e) => { setCode(e.target.value); setCodeErr(''); }} placeholder="Paste the code here" /></label>
            {codeErr && <p className="warn-text small">{codeErr}</p>}
            <button className="btn btn-block" disabled={!code.trim()} onClick={connect}>Connect Google Sheet</button>
            <button className="btn btn-outline btn-block danger" onClick={async () => { if (confirm('Erase everything on this phone and start fresh?')) { await repo.reset(false); await reload(); toast('Started fresh'); } }}>Erase and start fresh</button>
          </>
        ) : repo.mode === 'sheets' ? (
          <>
            <p className="small">Connected to your Google Sheet. Records live in the Sheet, files in a private Google Drive folder, and emails go out from your Gmail.</p>
            <button className="btn btn-outline btn-block" onClick={() => { if (confirm('Disconnect this phone from your Google Sheet? Your data stays in the Sheet; you can reconnect with your code.')) { saveConnection(null); location.reload(); } }}>Disconnect this phone</button>
          </>
        ) : (
          <>
            <p className="small">Synced to your secure cloud database.</p>
            <button className="btn btn-outline btn-block" onClick={() => supabase?.auth.signOut()}>Sign out</button>
          </>
        )}
      </fieldset>
      <p className="small center">Fit Habits · built by SolanoOps</p>
    </div>
  );
}
