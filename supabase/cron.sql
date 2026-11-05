-- Run once in the Supabase SQL editor AFTER deploying the Edge Functions.
-- It calls the `cron` function every hour; that function decides, in the
-- trainer's own timezone, whether it's time for the Friday motivation, the
-- daily missed-payment email, or a weekly/biweekly/monthly report.
--
-- 1. Database → Extensions: enable pg_cron and pg_net.
-- 2. Replace the two placeholders below, then run this file.
--    CRON_SECRET must match the secret set with: supabase secrets set CRON_SECRET=...

select vault.create_secret('https://<PROJECT-REF>.supabase.co', 'fithabits_project_url');
select vault.create_secret('<CRON_SECRET>', 'fithabits_cron_secret');

select cron.schedule(
  'fit-habits-hourly',
  '2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'fithabits_project_url') || '/functions/v1/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fithabits_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
