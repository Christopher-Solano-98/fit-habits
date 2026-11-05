-- Fit Habits schema. Every row belongs to the signed-in trainer (owner_id) and
-- row-level security makes each trainer's data invisible to everyone else.
-- Client-facing pages (intake) never query tables directly; they go through
-- Edge Functions that use the service role and check a one-time token.

create table public.settings (
  owner_id uuid primary key default auth.uid() references auth.users on delete cascade,
  trainer_name text not null default 'Coach',
  business_name text not null default 'Fit Habits',
  email text not null default '',
  phone text not null default '',
  motivation jsonb not null default '{"enabled":true,"weekday":5,"time":"07:00","channel":"both"}',
  alerts jsonb not null default '{"missedPayments":true,"graceDays":2,"emailTime":"18:00"}',
  reports jsonb not null default '{"weekly":true,"biweekly":true,"monthly":true}',
  scan_reminder_months int not null default 4,
  timezone text not null default 'America/New_York'
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  first_name text not null,
  last_name text not null default '',
  birth_date date,
  gender text,
  phone text,
  email text,
  address text,
  session_days int[] not null default '{}',
  session_time text,
  rate numeric(10,2) not null default 0,
  cycle text not null default 'weekly' check (cycle in ('weekly','biweekly','monthly','per_session')),
  due_weekday int not null default 1 check (due_weekday between 0 and 6),
  due_day_of_month int not null default 1 check (due_day_of_month between 1 and 31),
  channel text not null default 'text' check (channel in ('text','email','both','none')),
  medical_current text,
  medical_past text,
  emergency_name text,
  emergency_phone text,
  notes text,
  start_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  paid_on date not null,
  method text not null default 'cash' check (method in ('cash','zelle','cashapp','venmo','other')),
  note text,
  receipt_via text not null default 'none' check (receipt_via in ('text','email','both','none')),
  created_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  kind text not null check (kind in ('id','parq','medical','waiver','scan','photo','other')),
  name text not null,
  path text not null unique,
  mime text not null default '',
  size bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  taken_on date not null,
  "values" jsonb not null default '{}',
  note text,
  file_id uuid references public.files on delete set null,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  metric text not null,
  target numeric not null,
  by_date date,
  created_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  body text not null,
  sort int not null default 0
);

create table public.motivations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null,
  sent_on date,
  created_at timestamptz not null default now()
);

create table public.intakes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  token text not null unique check (length(token) >= 32),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  answers jsonb
);

-- Every text/email the server sends, for history and to avoid double-sends.
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  client_id uuid references public.clients on delete set null,
  kind text not null, -- receipt | quick | motivation | alert | report
  channel text not null, -- text | email
  to_address text not null,
  body text not null,
  status text not null, -- sent | failed | skipped
  error text,
  local_date date not null,
  created_at timestamptz not null default now()
);

create index on public.clients (owner_id);
create index on public.payments (owner_id, paid_on);
create index on public.payments (client_id);
create index on public.measurements (client_id, taken_on);
create index on public.files (client_id);
create index on public.goals (client_id);
create index on public.intakes (client_id);
create index on public.notices (owner_id, kind, local_date);

do $$
declare t text;
begin
  foreach t in array array['settings','clients','payments','files','measurements','goals','templates','motivations','intakes','notices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner only" on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Child rows must point at the same trainer's client.
create or replace function public.check_client_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.clients c where c.id = new.client_id and c.owner_id = new.owner_id) then
    raise exception 'client does not belong to this account';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['payments','files','measurements','goals','intakes'] loop
    execute format('create trigger check_client_owner before insert or update on public.%I for each row execute function public.check_client_owner()', t);
  end loop;
end $$;

-- Private bucket for IDs, PAR-Qs, medical forms, scans and photos.
-- Paths are <owner_id>/<client_id>/<file>, and only the owner can touch them.
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-files', 'client-files', false, 20971520)
on conflict (id) do nothing;

create policy "owner reads files" on storage.objects for select to authenticated
  using (bucket_id = 'client-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner uploads files" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner updates files" on storage.objects for update to authenticated
  using (bucket_id = 'client-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner deletes files" on storage.objects for delete to authenticated
  using (bucket_id = 'client-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
