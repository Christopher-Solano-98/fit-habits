import { useEffect, useMemo, useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { StoreProvider } from './data/store';
import { localRepo } from './data/local';
import { cloudRepo } from './data/cloud';
import { supabase } from './data/supabase';
import { gasRepo } from './data/gas';
import { getConnection } from './data/connection';
import { TabBar, Toast } from './components/ui';
import { Home } from './screens/Home';
import { Clients } from './screens/Clients';
import { ClientDetail } from './screens/ClientDetail';
import { ClientForm } from './screens/ClientForm';
import { Measure } from './screens/Measure';
import { ExerciseDetail, ExercisePicker } from './screens/Exercises';
import { LogPayment } from './screens/LogPayment';
import { Messages } from './screens/Messages';
import { Reports } from './screens/Reports';
import { Settings } from './screens/Settings';
import { Intake } from './screens/Intake';
import { Login } from './screens/Login';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function TrainerApp() {
  const conn = useMemo(getConnection, []);
  const useSupabase = !conn && !!supabase;
  const [session, setSession] = useState<Session | null | undefined>(useSupabase ? undefined : null);
  useEffect(() => {
    if (!useSupabase || !supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [useSupabase]);
  const repo = useMemo(() => (conn ? gasRepo(conn) : supabase ? cloudRepo(supabase) : localRepo()), [conn]);

  if (useSupabase && session === undefined) return <div className="center-screen"><p className="muted">Loading…</p></div>;
  if (useSupabase && !session) return <Login />;

  return (
    <StoreProvider repo={repo} key={session?.user.id ?? 'demo'}>
      <ScrollTop />
      <main className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/new" element={<ClientForm />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/clients/:id/edit" element={<ClientForm />} />
          <Route path="/clients/:id/measure" element={<Measure />} />
          <Route path="/clients/:id/measure/:mid" element={<Measure />} />
          <Route path="/clients/:id/exercise/new" element={<ExercisePicker />} />
          <Route path="/clients/:id/exercise/:exId" element={<ExerciseDetail />} />
          <Route path="/log" element={<LogPayment />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <TabBar />
      <Toast />
    </StoreProvider>
  );
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/intake/:token" element={<main className="app app-public"><Intake /></main>} />
        <Route path="*" element={<TrainerApp />} />
      </Routes>
    </HashRouter>
  );
}
