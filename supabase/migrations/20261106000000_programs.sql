-- Multi-week programs. client_id null = a reusable library program.
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  client_id uuid references public.clients on delete cascade,
  phase_weeks int not null default 2,
  phases jsonb not null default '[]',
  days jsonb not null default '[]',
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.programs (client_id);
alter table public.programs enable row level security;
create policy "owner only" on public.programs for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
