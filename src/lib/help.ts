// Tony's in-app user guide. Each screen's "?" button opens /help?topic=<id>.
// Steps support **bold** for button names.

export interface HelpTopic {
  id: string;
  q: string;
  steps: string[];
  tip?: string;
}

export interface HelpSection {
  title: string;
  topics: HelpTopic[];
}

export const HELP: HelpSection[] = [
  {
    title: 'Clients',
    topics: [
      {
        id: 'add-client',
        q: 'How do I add a client?',
        steps: [
          'Tap **Clients**, then **Add client**.',
          'Fill in their name, birthday, phone, email and address.',
          'Pick their session days and time.',
          'Under **Payment**, choose **Weekly**, **2 weeks**, **Monthly** or **Per session**, enter the rate and the day it’s due.',
          'Choose how they get receipts and messages: **Text**, **Email**, **Both** or **None**.',
          'Tap **Add client**.',
        ],
      },
      {
        id: 'client-profile',
        q: 'What’s on a client’s page?',
        steps: [
          '**Call** and **Text** reach them in one tap. **Log payment** records cash.',
          '**Info**: contact details, schedule, rate, health notes.',
          '**Pay**: every payment they’ve made.',
          '**Workouts**: their 8-week program and daily workouts.',
          '**Progress**: body measurements, exercises, goals.',
          '**Files**: intake packet, ID, signed waiver, scan reports, photos.',
          'Tap **Edit** (top right) to change anything about them.',
        ],
      },
      {
        id: 'edit-client',
        q: 'How do I edit, pause or remove a client?',
        steps: [
          'Open the client and tap **Edit**.',
          'Change what you need and tap **Save changes**.',
          'To pause someone, uncheck **Active client** at the bottom. They keep their history but stop getting reminders and messages.',
          'To remove them for good, tap **Delete client**. This also deletes their payments, files and progress.',
        ],
        tip: 'Pausing is usually better than deleting, so you keep their history.',
      },
      {
        id: 'quick-text',
        q: 'How do I text or call a client quickly?',
        steps: [
          'Open the client and tap **Text**.',
          'Pick a saved reply (payment reminder, running late, …). Your Messages app opens with it filled in. Tap send.',
          'Tap **Call** to ring them.',
          'To change the saved replies, go to **Messages → Quick replies**.',
        ],
      },
    ],
  },
  {
    title: 'Payments',
    topics: [
      {
        id: 'log-payment',
        q: 'How do I log a cash payment?',
        steps: [
          'Tap the green **+** at the bottom (or **Log payment** on a client).',
          'Pick the client. The amount they owe fills in. Change it if needed.',
          'Leave the date as today and **Send receipt** on.',
          'Tap **Log**. The client gets: “We received your $X cash payment on [date]. Thank you!”',
        ],
      },
      {
        id: 'backlog',
        q: 'How do I enter old payments (backlog)?',
        steps: [
          'Tap the green **+** and pick the client.',
          'Enter the amount and change **Date** to the day you were paid.',
          '**Send receipt** turns off by itself for past dates, so clients don’t get old receipts.',
          'Tap **Log**, then **Log another** for the next one. The client and date stay filled in.',
        ],
      },
      {
        id: 'who-paid',
        q: 'How do I see who hasn’t paid?',
        steps: [
          '**Home** shows an orange box with everyone who hasn’t paid yet, how much and how many days late.',
          'Tap **Text** to send a reminder or **Log** when they pay.',
          'You also get an email when a payment is a couple of days late (change this in **Messages → Automations**).',
        ],
      },
      {
        id: 'payment-mistake',
        q: 'I logged a payment by mistake. How do I fix it?',
        steps: [
          'Open the client and tap **Pay**.',
          'Tap the trash can next to the wrong payment and confirm.',
          'Log it again with the right amount or date.',
        ],
      },
      {
        id: 'reports',
        q: 'Where are my reports?',
        steps: [
          'Tap **Reports** at the bottom.',
          'Switch between **This week**, **2 weeks**, **Month** and **Year**. You’ll see who paid, how much, and who hasn’t paid.',
          '**Email me** sends the summary to your email. **Export CSV** gives a spreadsheet for taxes.',
          'A weekly report also emails you every Friday evening, plus 2-week and monthly summaries.',
        ],
      },
    ],
  },
  {
    title: 'Intake, waiver and files',
    topics: [
      {
        id: 'intake',
        q: 'How does a new client fill out the PAR-Q and waiver?',
        steps: [
          'Open the client → **Files** → **Intake packet** → **Text** or **Email**.',
          'They get a link by text or email (emails come from fit.habits96@gmail.com). On their phone they answer the 7 health questions, add medical history and an emergency contact, take a photo of their ID and sign the waiver by typing their name.',
          'If they’re with you, tap **Fill out here on this phone** and hand them your phone instead.',
        ],
      },
      {
        id: 'intake-results',
        q: 'Where do I see their answers and signed waiver?',
        steps: [
          'Open the client → **Files**.',
          'The intake card shows **Completed** and flags any “Yes” health answer in orange. Follow up on those before training hard.',
          'Their **Signed waiver** and **Photo ID** are listed below. Tap to open.',
          'Their medical history and emergency contact also show on **Info**.',
        ],
      },
      {
        id: 'waiver-text',
        q: 'How do I change my waiver wording?',
        steps: ['Tap the gear on **Home** → **Settings** → **Your waiver**.', 'Paste your waiver and tap **Save waiver**. New clients sign this version.'],
      },
      {
        id: 'files',
        q: 'How do I upload a file or photo for a client?',
        steps: ['Open the client → **Files**.', 'Tap **Add** next to the type (ID, PAR-Q, waiver, scan report, progress photo, other).', 'Take a photo or pick a file. It’s stored privately in your Google Drive.'],
      },
    ],
  },
  {
    title: 'Progress',
    topics: [
      {
        id: 'measurements',
        q: 'How do I record weight, body fat or a body scan?',
        steps: [
          'Open the client → **Progress** → **+ Add measurements**.',
          'Set the date and fill in only what you measured (weight, body fat, waist, blood pressure …).',
          'Attach the scan report if you have one, then **Save**.',
          'The chart shows the change, like “Oct 1: 18% → now 8%”. You’ll get a reminder when their next scan is due.',
        ],
      },
      {
        id: 'exercises',
        q: 'How do I track an exercise (lifts, calisthenics, mile time)?',
        steps: [
          'Open the client → **Progress** → **+ Add exercise**.',
          'Pick from the library by body part, **Calisthenics** or **Cardio**, or search.',
          'Enter their numbers (weight × reps, reps, or a time like 7:42) and tap **Log it**.',
          'Each exercise gets a chart and their personal best. A new record pops up as “New personal best!”',
        ],
      },
      {
        id: 'custom-exercise',
        q: 'How do I add my own exercise?',
        steps: [
          'In the exercise library, tap **Create your own exercise**.',
          'Name it, pick the body part and how it’s measured (**Weight**, **Reps**, **Hold** or **Time**).',
          'It’s saved with a ★ and works for every client.',
        ],
      },
      {
        id: 'goals',
        q: 'How do I set a goal and share progress?',
        steps: [
          'On **Progress**, tap **+ Add goal**, pick what it’s for and the target (like Pull-ups 15 or Mile 7:00).',
          'A bar shows how close they are, and the chart shows a dashed goal line.',
          'Tap **Share progress** to text them their before and after numbers.',
        ],
      },
    ],
  },
  {
    title: 'Workouts and programs',
    topics: [
      {
        id: 'workout',
        q: 'How do I run today’s workout with a client?',
        steps: [
          'Open the client → **Workouts** → **Start today’s workout**.',
          'Pick a saved workout, repeat their last one, or **Build from scratch**.',
          'Each exercise has sets × reps and a **target** (weight, reps or time) that starts at their last numbers. Tap **Use** to copy last time, or type a new target for them.',
          'Tap the circle to check an exercise off and enter what they did.',
          'Tap **Finish workout**. Their results go to Progress automatically.',
        ],
      },
      {
        id: 'workout-library',
        q: 'How do I save and reuse workouts?',
        steps: [
          'In any workout, tap **Save to workout library** and name it.',
          'Next time, pick it from **Start today’s workout**. Each person’s targets fill in from their own last numbers.',
          'Manage all saved workouts in **Clients → Workouts**. Open one and tap **Use for a client today** to assign it.',
        ],
      },
      {
        id: 'programs',
        q: 'How do I build an 8-week program?',
        steps: [
          'Go to **Clients → Workouts** → **+ New program** (or a client’s **Workouts → Create an 8-week program**).',
          'There are 4 phases of 2 weeks: Foundation, Progress, Regress (deload), Peak. Rename them if you like.',
          'Add workout days (“Day 1 · Upper”) and exercises, then tap each phase and write its plan, like 3 × 10 @ 95 → 4 × 8 @ 115.',
          '**Fill empty plans from …** copies the last phase so you only change what’s different.',
          'Tap **Add video** on an exercise to link your own how-to video.',
        ],
      },
      {
        id: 'send-program',
        q: 'How do I give a client their program?',
        steps: [
          'From the library program, tap **Assign to a client** and pick a start date.',
          'Tap **Send to [client]**. They get a link to their plan: it opens on the week they’re in, and every exercise links to a how-to video.',
          'On their **Workouts** tab, tap a day (like **Day 1**) to start today’s workout from the current phase.',
        ],
      },
    ],
  },
  {
    title: 'Messages and automatic emails',
    topics: [
      {
        id: 'friday',
        q: 'How does the Friday motivation work?',
        steps: [
          'Go to **Messages**. Type this week’s message in the box and tap **Save message**.',
          'Tap **Goes to … clients** to see the list. Uncheck anyone who shouldn’t get it. New clients are on it by default.',
          'Set the day, time, and **Text**, **Email** or **Both**.',
          'Tap **Text me a test** to see how it looks.',
          'It sends on its own every week. Each client gets their own message, so nobody sees the others.',
          'The day before (Thursday at 7 AM) you get a preview email with the message and who it\u2019s going to, so you can change it in time. Set where it goes under **Email me a preview the day before**.',
        ],
      },
      {
        id: 'automations',
        q: 'What emails do I get automatically?',
        steps: [
          'A reminder when a payment is late (you choose after how many days).',
          'A “who paid this week” report every Friday evening, plus 2-week and monthly summaries.',
          'A heads-up when a client is due for a body scan.',
          'Turn any of these on or off in **Messages → Automations**. Emails come from fit.habits96@gmail.com.',
        ],
      },
    ],
  },
  {
    title: 'Settings and help',
    topics: [
      {
        id: 'connect',
        q: 'How do I set up the app on a new phone?',
        steps: [
          'Open the app link in **Safari** → **Share** → **Add to Home Screen**.',
          'Open it from the icon → gear → **Settings** → paste your connection code → **Connect Google Sheet**.',
          'Ask Chris for the connection code and Web app URL. Keep the code private: it unlocks your client data.',
          'Anything you added before connecting shows up on **Home** as “saved only on this phone”. Tap **Move them to my Google Sheet**. Connect from the same place you added them (the Home Screen icon or Safari), because on iPhone each one keeps its own copy.',
        ],
      },
      {
        id: 'not-loading',
        q: 'The app says “Couldn’t load your data”',
        steps: [
          'Check the phone has internet, then tap **Try again**.',
          'Still stuck? Tap **Re-enter connection code** and paste the code again.',
          'If that doesn’t work, contact Chris.',
        ],
      },
      {
        id: 'updates',
        q: 'How do I get the latest version?',
        steps: ['Swipe the app closed and open it again. New updates load on their own.', 'If something still looks old, close and reopen once more.'],
      },
      {
        id: 'your-data',
        q: 'Where is my data stored?',
        steps: [
          'Clients, payments and progress live in your Google Sheet **Fit Habits Data**. Settings → **Open the Google Sheet** opens it.',
          'IDs, waivers and scans are in a private Google Drive folder only you can open.',
          'Losing your phone doesn’t lose anything. Just set up the app again.',
        ],
      },
    ],
  },
];
