-- Different session times on different days: {"1": "8:00 AM", "2": "10:00 AM"}
alter table public.clients add column if not exists session_times jsonb;
