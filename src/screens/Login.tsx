import { useState, type FormEvent } from 'react';
import { supabase } from '../data/supabase';
import { Brand } from '../components/Brand';

// Password sign-in (not magic links): an app saved to the iPhone Home Screen
// keeps its own storage, so an emailed link would sign in Safari instead.
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setBusy(false);
  };

  const reset = async () => {
    if (!email) return setErr('Enter your email first');
    await supabase!.auth.resetPasswordForEmail(email, { redirectTo: location.href });
    setErr('Password reset email sent.');
  };

  return (
    <form className="page form login" onSubmit={go}>
      <Brand variant="full" />
      <h1 className="display">Sign in</h1>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {err && <p className="warn-text">{err}</p>}
      <button className="btn btn-block btn-lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" className="btn-ghost" onClick={reset}>Forgot password</button>
    </form>
  );
}
