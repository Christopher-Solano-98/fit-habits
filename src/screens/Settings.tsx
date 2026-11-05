import { useState } from 'react';
import type { Settings as S } from '@shared/types.ts';
import { useStore } from '../data/store';
import { supabase } from '../data/supabase';
import { Header } from '../components/ui';

export function Settings() {
  const { snap, saveSettings, repo, reload, toast } = useStore();
  const [s, setS] = useState<S>(snap.settings);
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
        <legend>Add to Home Screen</legend>
        <p className="small"><strong>iPhone:</strong> open this page in Safari, tap the Share button, then "Add to Home Screen".</p>
        <p className="small"><strong>Android:</strong> open in Chrome, tap the ⋮ menu, then "Install app" or "Add to Home screen".</p>
      </fieldset>

      <fieldset>
        <legend>Data</legend>
        {repo.mode === 'demo' ? (
          <>
            <p className="small">Demo mode: everything is saved on this device only. Connect Supabase to sync, back up and send texts and emails automatically.</p>
            <div className="grid2">
              <button className="btn btn-outline" onClick={async () => { if (confirm('Replace everything with sample clients?')) { await repo.reset(true); await reload(); toast('Sample data loaded'); } }}>Load sample data</button>
              <button className="btn btn-outline danger" onClick={async () => { if (confirm('Erase all data on this device and start fresh?')) { await repo.reset(false); await reload(); toast('Started fresh'); } }}>Start fresh</button>
            </div>
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
