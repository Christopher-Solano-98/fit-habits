-- Reusable workouts (the trainer's library) and per-client workout sessions.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  date date not null,
  name text not null,
  items jsonb not null default '[]',
  workout_id uuid references public.workouts on delete set null,
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index on public.sessions (client_id, date);

alter table public.workouts enable row level security;
alter table public.sessions enable row level security;
create policy "owner only" on public.workouts for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner only" on public.sessions for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger check_client_owner before insert or update on public.sessions for each row execute function public.check_client_owner();
