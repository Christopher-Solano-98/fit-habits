# Fit Habits

Client, payment and progress tracker for Fit Habits personal training. Built by SolanoOps.

It's a web app that installs to the phone's Home Screen (a PWA), so there's no App Store. The backend is a Google Sheet plus Apps Script in the trainer's own Google account.

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

## How it's put together

- **The app** (screens, icon, Home Screen install) is a static web app hosted free on **GitHub Pages**. It deploys on every push to `main` (`.github/workflows/pages.yml`).
- **The backend** is **Google Apps Script** (`apps-script/`), running in the trainer's Google account:
  - records in a **Google Sheet**, one tab per table, which he can open any time
  - files (IDs, PAR-Qs, scans, photos) in a **private Drive folder**
  - receipts, reports and alerts sent by **email from his Gmail**
  - an **hourly trigger** for the weekly motivation, missed-payment emails and weekly/biweekly/monthly reports
- With no backend connected, the app runs in **demo mode** with sample clients, saved on that phone only. That's what to use for demos.

| | Demo mode | Connected to Google Sheet |
|---|---|---|
| Data | this phone only, sample clients | Tony's Google Sheet + Drive |
| Email receipts and reports | open Mail pre-filled | sent automatically from his Gmail |
| Texts | open Messages pre-filled | same; automatic once Twilio is added |
| Scheduled jobs | — | hourly Apps Script trigger |

## 1. Put the app online (GitHub Pages)

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Source: GitHub Actions**. The next push publishes to `https://<user>.github.io/<repo>/`.
   - Free GitHub accounts only get Pages on **public** repos. That's safe here: there are no keys or client data in the code. Or use GitHub Pro, or connect the repo to Netlify or Vercel instead.
3. On the phone, open that link and add it to the Home Screen:
   - iPhone: **Safari** → Share → **Add to Home Screen**
   - Android: Chrome → ⋮ → **Install app**

   It opens full screen with its own icon, in demo mode.

## 2. Connect the Google backend (in Tony's Google account)

1. Signed in as Tony, create a Google Sheet named **Fit Habits Data**.
2. In the Sheet: **Extensions → Apps Script**. Create three files and paste in the contents of:
   - `apps-script/Code.js` → `Code.gs`
   - `apps-script/Shared.js` → `Shared.gs`
   - `apps-script/appsscript.json` (Project Settings → check "Show appsscript.json", then paste)

   Or push them with [clasp](https://github.com/google/clasp): `clasp clone <scriptId>`, copy the files in, `clasp push`.
3. Pick **setup** in the function menu and click **Run**. Approve the permissions (Sheets, Drive, send email, triggers). This creates the tabs, a private Drive folder, the app key and the hourly trigger.
4. **Deploy → New deployment → Web app**. Set Execute as: **Me**, Who has access: **Anyone**, then click Deploy.
   - "Anyone" only means the phone can reach it. Every request needs the private key, except the client intake form, which needs its one-time link.
5. Run **connectionCode** and copy the code from the log (View → Logs).
6. In the app on Tony's phone: **Settings → Connection code**. Paste it, then tap **Connect Google Sheet**.
   - Do this *inside* the Home Screen app. iPhone keeps Home Screen apps separate from Safari.
7. In the app's Settings, enter Tony's name, business name and email. The reports go to that email.
8. Optional test: run **testReport** to email the weekly report right away.

When the code changes, paste the new `Code.js`/`Shared.js`, then **Deploy → Manage deployments → Edit → New version**. The URL stays the same, so phones don't need to reconnect. If a phone with the code is lost, run **rotateKey** and reconnect the other phones.

### Automatic texts (optional, later)
Apps Script can't text on its own. Until Twilio is set up, texts open the phone's Messages app pre-filled. To make them automatic, add these in Apps Script **Project Settings → Script properties**:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`)

That needs a Twilio number with A2P 10DLC registration, which takes 1–3 weeks.

### Limits worth knowing
- A free Gmail account sends about 100 emails a day through Apps Script. That's plenty for a dozen clients.
- Each save takes about a second, since it's going to a Google Sheet.
- Don't rename the Sheet's tabs or header rows. The script finds them by name.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 (demo mode)
npm test           # billing/metrics rules + Apps Script backend against fake Google services
npm run build      # typecheck + production build into dist/
npm run build:gas  # regenerate apps-script/Shared.js after editing supabase/functions/_shared
```

`supabase/` holds an alternative backend (Supabase + Edge Functions) kept for later, if Tony outgrows Google Sheets. `supabase/functions/_shared/` is the billing, dates, metrics and messages logic that the app, Apps Script and Supabase all share.

## Before launch

- [ ] Check the PAR-Q+ wording in `supabase/functions/_shared/parq.ts` against the official form and its terms (eparmedx.com).
- [ ] Replace the placeholder waiver text in `src/screens/Intake.tsx` with Tony's own waiver.
- [ ] Swap in Tony's logo: `public/icons/` (192, 512 and the 180 px apple-touch-icon).
- [ ] Security review of `apps-script/Code.js` (key check, intake token, Drive folder sharing). The app stores medical history and ID photos.

## Layout

```
src/                         React app (screens, components, data layer)
src/data/local.ts            demo mode (localStorage + IndexedDB for files)
src/data/gas.ts              Google Apps Script backend client
src/data/connection.ts       connection code, API calls, photo shrinking
apps-script/Code.js          the Apps Script backend (Sheet, Drive, Gmail, triggers)
apps-script/Shared.js        generated: shared rules bundled for Apps Script
supabase/functions/_shared/  pure TS shared everywhere (billing, dates, metrics, messages, PAR-Q)
tests/                       vitest: rules + Apps Script backend (tests/gas-mock.cjs fakes Google)
.github/workflows/pages.yml  build + deploy to GitHub Pages
```
