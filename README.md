# Fit Habits

Client, payment and progress tracker for Fit Habits personal training. Built by SolanoOps.

It's a web app that installs to the phone's Home Screen (a PWA), so there's no App Store.

## What it does

- **Clients:** name, birthday/age, gender, contact, address, schedule, rate, health notes, emergency contact
- **Payments:** log cash (or Zelle, Cash App, Venmo) in two taps. The client gets a receipt by text or email.
- **Missed-payment alerts:** shown on the home screen, plus a daily email to the trainer. Billing can be weekly, every 2 weeks, monthly or per session.
- **One-tap call and text:** with saved quick replies that fill in each client's name, rate and schedule
- **Intake packet:** a secure link the client fills out on their phone. It covers the PAR-Q+ questions, medical history, emergency contact, a photo of their ID and a typed-signature waiver.
- **Files:** ID, PAR-Q, medical, waiver, scan reports and progress photos, in a private encrypted bucket
- **Progress (measurables):** weight, body fat, lean mass, BMI, tape measurements, resting heart rate, blood pressure, push-ups, plank, mile time and lifts
  - charts over time, with the goal line drawn on the chart
  - goals with progress bars
  - body-scan reminders every N months
  - a "Share progress" text to send the client
- **Messages:** a weekly motivation message on a schedule, sent by text and/or email, rotating through an editable library
- **Reports:** week, 2 weeks, month and year views, plus a CSV export for taxes. Weekly, biweekly and monthly report emails go out automatically.

## Two modes

| | Demo mode | Cloud mode |
|---|---|---|
| Turned on by | no `.env` | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| Data | this browser only, loaded with sample clients | Supabase Postgres, synced and backed up |
| Sign-in | none | email + password |
| Receipts and texts | open the phone's own Messages or Mail app, pre-filled | sent automatically (Twilio / Resend). The pre-filled fallback still works. |
| Scheduled jobs | — | hourly `cron` function |

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # billing, dates and metrics tests
npm run build      # typecheck + production build into dist/
```

## Go live (cloud mode)

1. **Supabase** (free tier is fine): create a project.
   - Run `supabase/migrations/*.sql` in the SQL editor, or `supabase db push`.
   - Under Auth → Providers, turn **off** "Allow new users to sign up".
   - Under Auth → Users, create Tony's login.
2. **Hosting:** connect this repo to Vercel or Netlify.
   - Build command `npm run build`, output folder `dist`.
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
   - GitHub Pages also works. Build with `BASE_PATH=/<repo-name>/`.
3. **Edge Functions:**
   ```bash
   supabase functions deploy notify
   supabase functions deploy intake
   supabase functions deploy cron
   supabase secrets set CRON_SECRET=<long random string>
   ```
4. **Email** ([Resend](https://resend.com)): verify the sending domain, then:
   `supabase secrets set RESEND_API_KEY=... EMAIL_FROM="Fit Habits <coach@yourdomain.com>"`
5. **Texting** ([Twilio](https://twilio.com)):
   - Buy a number and complete A2P 10DLC business registration. That takes 1–3 weeks.
   - Then: `supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_MESSAGING_SERVICE_SID=...`
   - Until then, texts open pre-filled in the phone's Messages app.
6. **Scheduled jobs:** enable `pg_cron` and `pg_net`, fill in the placeholders in `supabase/cron.sql` and run it.
7. On Tony's phone, open the site and add it to the Home Screen:
   - iPhone: Safari → Share → "Add to Home Screen"
   - Android: Chrome → ⋮ → "Install app"

## Before launch

- [ ] Check the PAR-Q+ wording in `supabase/functions/_shared/parq.ts` against the official form and its terms (eparmedx.com).
- [ ] Replace the placeholder waiver text in `src/screens/Intake.tsx` with Tony's own waiver.
- [ ] Swap in Tony's logo: `public/icons/` (192, 512 and the 180 px apple-touch-icon).
- [ ] Security review of the RLS policies, storage policies and the `intake` function. The app stores medical history and ID photos.

## Layout

```
src/                         React app (screens, components, data layer)
src/data/local.ts            demo-mode storage (localStorage + IndexedDB for files)
src/data/cloud.ts            Supabase storage
supabase/functions/_shared/  pure TS shared by the app and the Edge Functions
                             (billing rules, dates, metrics, message templates, PAR-Q)
supabase/functions/_lib/     Deno-only helpers (DB client, Twilio, Resend)
supabase/functions/notify    sends receipts/messages for the signed-in trainer
supabase/functions/intake    public intake form endpoint (one-time token)
supabase/functions/cron      hourly: motivation, missed-payment email, reports
supabase/migrations/         schema + row-level security + storage bucket
tests/                       vitest unit tests
```
