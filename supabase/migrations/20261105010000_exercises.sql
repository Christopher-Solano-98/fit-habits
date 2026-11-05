-- Exercise library (trainer-added; built-ins live in the app) and logs per client.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  "group" text not null,
  kind text not null check (kind in ('weight','reps','hold','time')),
  created_at timestamptz not null default now()
);

create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  exercise_id text not null, -- "b-…" for built-ins, else an exercises.id
  date date not null,
  value numeric not null,
  reps int,
  note text,
  created_at timestamptz not null default now()
);

create index on public.exercise_logs (client_id, exercise_id, date);

alter table public.exercises enable row level security;
alter table public.exercise_logs enable row level security;
create policy "owner only" on public.exercises for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner only" on public.exercise_logs for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger check_client_owner before insert or update on public.exercise_logs for each row execute function public.check_client_owner();
