# Tap-Tap Mo

An IoT-based RFID attendance and parent SMS notification system for Baguio City National High School – Senior High School.
CIT 6 Capstone Project, University of the Cordilleras. Belarde, Anthon Rovic E. and Masing, Isaiah Angelo G.

## How it fits together

```
 Gate PC 1 (Electron app)  ─┐
   USB RFID reader          │   school LAN    ┌──────────────────────────┐   internet   ┌─────────┐
   saves taps locally first ├────────────────►│ Server PC (Node/Express) │─────────────►│ Cast PH │──► parent's phone
 Gate PC 2 (Electron app)  ─┘                 │ SQLite database          │   (texts     └─────────┘
                                              │ SMS queue + retries      │    queued if
 Staff browsers ─────────────────────────────►│ Staff dashboard          │    offline)
                                              └──────────────────────────┘
```

- **A tap is never lost.** The gate app writes every tap to its own outbox before sending it to the server,
  so taps survive a server, network, or power problem.
- **A text is never lost.** The server saves the tap, then puts the text in a queue. If the internet is down
  or Cast PH fails, the text waits and is retried automatically.
- **Staff can see every text's status**: queued, sent, delivered, or failed.

## Folder structure

```
Tap-Tap-mo/
├── docs/                       Design thinking doc, diagrams, test results
│
├── server/                     Runs on the server PC (Node.js + Express + SQLite)
│   ├── .env.example            Settings template: copy to .env
│   ├── src/
│   │   ├── index.js            Starts the server, connects all routes
│   │   ├── config.js           Reads settings from .env
│   │   ├── db/
│   │   │   ├── schema.sql      All tables
│   │   │   └── index.js        Opens the database
│   │   ├── routes/             The API: one file per area (URLs only, logic lives in services/)
│   │   │   ├── gate.js         Taps from the gate apps, roster for offline names
│   │   │   ├── auth.js         Staff login
│   │   │   ├── students.js     Student records, Excel or CSV import, section sizes, student list
│   │   │   ├── cards.js        Link, replace, deactivate RFID cards
│   │   │   ├── verification.js Parent mobile number code
│   │   │   ├── attendance.js   Today's counts and taps, weekly summary, Log by LRN, records API
│   │   │   ├── sms.js          SMS log, failed texts, retry, credits
│   │   │   ├── reports.js      Daily and monthly reports, CSV and Excel (SF2) export
│   │   │   ├── holidays.js     No-class days
│   │   │   ├── backups.js      Latest backup, back up now
│   │   │   ├── settings.js     Lunch and SMS settings (admins)
│   │   │   └── templates.js    School templates on Reports and files
│   │   ├── services/           The actual logic
│   │   │   ├── attendance.js   What a tap means: time in, lunch, late, early out, time out
│   │   │   ├── smsQueue.js     Background sending and retries
│   │   │   ├── messages.js     Text templates (one SMS credit each)
│   │   │   ├── studentImport.js  Reading and checking CSV student lists
│   │   │   ├── verification.js   Parent number codes (one student or a whole class)
│   │   │   ├── attendanceReports.js  Dashboard counts, daily and monthly reports
│   │   │   ├── sf2.js          Monthly attendance as an Excel file in the SF2 layout
│   │   │   ├── excelExports.js Excel files: attendance (daily or monthly) and a section's student list
│   │   │   ├── reportFiles.js  Copies of downloaded reports, one folder per school year and section
│   │   │   ├── templates.js    The school's SF2 and student list templates
│   │   │   ├── settings.js     Settings changed on the dashboard (they replace .env values)
│   │   │   ├── secrets.js      Encrypts API keys saved in the database (SECRETS_KEY)
│   │   │   ├── schoolDays.js   Weekdays that aren't holidays
│   │   │   ├── smsLog.js       SMS log, today's counts, retrying texts
│   │   │   ├── internet.js     Checks every minute whether the internet is up
│   │   │   ├── backup.js       Daily database backup (and a copy of the photos)
│   │   │   ├── photos.js       Student photos shown at the gate
│   │   │   └── sms/            SMS providers, all with the same functions
│   │   │       ├── index.js    The provider chosen on Lunch and SMS settings (or SMS_PROVIDER)
│   │   │       ├── mockProvider.js       Prints texts to the console (test mode)
│   │   │       ├── semaphoreProvider.js  Real texts through Semaphore (semaphore.co)
│   │   │       └── castphProvider.js     Real texts (after Cast PH gives API details)
│   │   ├── middleware/         Gate key check, staff login check
│   │   └── utils/time.js       Dates and times in Asia/Manila
│   └── public/                 Staff dashboard (HTML, CSS, JS): school maroon sidebar built by
│                               js/nav.js, styles in css/style.css, school logo in img/logo.png
│
└── gate-app/                   Runs on each gate PC (Electron)
    ├── config.example.json     Server address, gate id and key: copy to config.json
    └── src/
        ├── main.js             Opens the gate window, handles taps
        ├── preload.js          Safe bridge between the screen and main.js
        ├── outbox.js           Taps waiting to be uploaded (saved to disk first)
        ├── roster.js           Local card -> name list for offline mode
        ├── photos.js           Student photos kept on the gate PC for offline mode
        ├── sync.js             Uploads taps, downloads the roster and photos
        └── renderer/           The gate screen (Figure 3: waiting, ok, offline, not registered)
                                on the school background (background.jpg); photo appears in its box
```

## User stories → where they live

| Story | What | Files |
|---|---|---|
| US-01, US-02 | Time-in and time-out texts | `server/src/services/attendance.js`, `smsQueue.js`, `messages.js` |
| US-03 | Texts still sent after an outage | `server/src/services/smsQueue.js` |
| US-04 | Late notice | `server/src/services/attendance.js`, `messages.js` |
| US-05 | Verify parent mobile number | `server/src/services/verification.js`, `public/register.html`, `public/verify-class.html` |
| US-06, US-14 | Gate screen feedback | `gate-app/src/renderer/` |
| US-07 | Tap saved when offline | `gate-app/src/outbox.js`, `sync.js` |
| US-08 | Replace lost card | `server/src/routes/cards.js` |
| US-09, US-10 | Today's attendance and text status | `server/src/services/attendanceReports.js`, `public/index.html` |
| US-11 | Queued and failed texts | `server/src/services/smsLog.js`, `public/sms-log.html` |
| US-12 | Texts sent and credits left | `server/src/services/smsLog.js`, `public/index.html` |
| US-13 | Reports export | `server/src/routes/reports.js`, `public/reports.html` |

## Running it (development)

Requires Node.js 22 or newer.

**First time only**

```bash
cd server
npm install
cp .env.example .env
cd ../gate-app
npm install
cp config.example.json config.json
cd ..
```

Then create your staff login for the dashboard (you'll be asked for a password):

```bash
npm run add-user -- --username admin --name "Isaiah Angelo G. Masing" --role admin
```

Roles: `admin` (everything), `staff` (registration, fixing numbers), `teacher` (viewing attendance).

**Every time**, from the main `Tap-Tap-mo` folder, in two terminals:

```bash
npm run server
```

```bash
npm run gate
```

Open http://localhost:3000 for the dashboard and log in. While `SMS_PROVIDER=mock`, texts are printed in the
server terminal instead of sent. The first `npm run gate` downloads Electron. You don't need a reader
to test: type any card number and press Enter. A USB reader does the same thing.

**Add many students at once**

1. **Import students**: upload the enrollment list (for example the SF1 School Register) as an Excel
   file (.xlsx) or CSV, or fill in the school's template (**Download template** on the Students page,
   then **Import filled template**). You see a preview of every row first,
   with problems (bad grade, unknown strand, invalid number, LRN changed by Excel) and students already
   added. Only the good new rows are imported, so you can fix the file and import it again safely.
   Include the **Sex** (M or F) and **School ID** columns: sex sorts boys and girls on the SF2 sheet, and
   the school ID is shown at the gate and in reports.
2. **Assign cards**: choose a class and tap cards one after another. Each tap goes to the next student
   without a card. Use **Skip** for absent students and **Undo last card** for a wrong tap.
   Every card gets a short number (0001, 0002, ...) in the order it was assigned. Write it on the card
   so a lost card can be matched to its student; the Students page searches by it.
3. **Verify numbers**: choose a class and click **Send codes**. Every unverified parent with a number gets
   a code that works for 3 days. Parents give the code to their child, and the adviser types it in on
   the same page. Texts that fail (usually a wrong number) are shown so staff can fix the number.
   Sending again skips parents who already have a working code. Advisers (teacher accounts) can enter
   codes; only admin and staff can send texts, since each one uses an SMS credit.

To recognize your school's own column names, add them to `COLUMN_NAMES` in
`server/src/services/studentImport.js`.

**Register a student and card**

Plug a USB reader into the computer with the dashboard, open **Register card**, tap the card, fill in the
student and parent details (sex is required; the LRN and school ID are optional, and the LRN lets them
use the gate without a card), and click **Save and send verification code**. The page shows the card's
number once it is saved. In test mode the code is
printed in the server terminal instead of texted; type it in and click **Verify**. Only verified numbers
get attendance texts. If the parent isn't there, save anyway and tap the same card later to finish.
Tapping a card that is already registered opens that student for editing, for example to add their LRN.

Shortcut for test data: `add-student` registers a card and marks the number verified in one step.
Find the card's number by tapping it while Notepad is open: the reader types it.

```bash
npm run add-student -- --uid 0004567890 --name "Stephanie Lei Polonio" --sex F --grade 12 --strand STEM --section A --mobile 09170005590 --school-id 2026-00123
```

Restart the gate app (or wait 5 minutes) so it downloads new names for offline mode.

**Things to try**

| Try this | What should happen |
|---|---|
| Tap a registered card | Green "TIME IN" screen; the text appears in the server terminal |
| Tap it again within 30 seconds | "ALREADY TAPPED", no text |
| Tap it again after 30 seconds | Before 12 PM: amber "EARLY OUT" and a "left school EARLY" text. 12–1 PM: "LUNCH OUT", no text. From 4 PM: "TIME OUT" and a "left school" text |
| Tap an unregistered card | Red "Card not registered" screen showing the card number |
| Stop the server, then tap | Orange "OFFLINE: TAP SAVED" with the student's name |
| Start the server again | Within 5 seconds the saved taps upload and their texts go out |
| Register a number ending in `0000` | The text is marked failed (invalid number) |
| Set `MOCK_SMS_FAIL_RATE=1`, restart the server, tap | The text stays queued and retries; set it back to `0` and it sends |

## The school day

Set in `server/.env` (restart the server after changing them). The lunch times can also be changed on
**Lunch and SMS settings** without restarting; those replace `LUNCH_START` and `LUNCH_END`.

| Time | Setting | What happens |
|---|---|---|
| 8:00 AM | `LATE_AFTER` | The first tap of the day after this is **late** (texted as "arrived LATE") |
| 12:00–1:00 PM | `LUNCH_START`, `LUNCH_END` | Tapping out is **lunch out** and tapping back in is **back from lunch**. Neither is texted |
| after 1:00 PM | `LUNCH_END` | Coming back from lunch is **late from lunch** (texted) |
| before 4:00 PM | `DISMISSAL_TIME` | Tapping out outside lunch is an **early out** (texted as "left school EARLY") |
| from 4:00 PM | `DISMISSAL_TIME` | Tapping out is **time out** (texted as "left school") |

A student who left early and comes back taps in again (texted, never late). On weekends and holidays
nothing is late or early. Two taps within 30 seconds count once. The dashboard and reports show late
from lunch and left early separately from morning lateness.

**No card? Use the LRN.** A student without their card types their 12-digit LRN into the box at the
bottom of the gate screen ("No ID card? Type your 12-digit LRN"), using the gate PC's keyboard, and
presses Enter (Esc clears). The card reader types into the same box, so cards work as before. It counts like a
tap and texts the parent as usual. The gate shows "Entered by LRN. Please bring your card next time", and
the dashboard and daily report mark it **LRN** / "Typed LRN (no card)" so staff can check it was really
that student. The card reader is checked first, so cards whose numbers happen to be 12 digits still work.
To turn LRN entry off, set `ALLOW_LRN_ENTRY=false` in `server/.env`. LRNs come from the import, the
Register card page, or `add-student --lrn`.

## Daily use

The sidebar has the five everyday pages first (Dashboard, Students, Log by LRN, Reports and files,
Lunch and SMS settings), then **Cards and parents** (Register card, Assign cards, Import students,
Verify numbers, SMS log). Each person only sees the pages their role can use.

- **Dashboard**: today's **on time**, **late**, **absent** and **late from lunch** counts, then the
  **Attendance summary this week**: average attendance (compared with the week before), tardiness (late
  arrivals out of all arrivals), late from lunch and absences, and each day with its attendance bar,
  late arrivals and late from lunch, plus the students most often late. Use **Previous week** for earlier
  weeks; the class filter at the top applies to the whole page and shows how many are enrolled (male and
  female). Below: failed texts (admin and staff), and **Today's taps** with each parent's text status,
  internet and SMS status, and the last backup (admins). Updates every 15 seconds.
- **Students**: the number of students in all and per section (male and female). Pick a section with the
  tabs at the top, or search every section by name, LRN, ID number or card number. Each section shows its
  **Male** and **Female** students (first 10, then **Show all**) with their LRN, ID number, RFID card
  number (and card no.), and parent's number. **Number of students in this section** + **Repopulate
  list** saves how many students the section should have and reloads the list, saying how many are
  still missing. **Download Excel** gives the section's list with Male and Female sheets (admin and
  staff, since it has parents' numbers). **Download template** / **Import filled template** add
  students. **Edit** opens the student on Register card; **Add photo** (or **Change photo**) adds the
  photo the gate screen shows when they tap. Photos are shrunk in the browser before upload (600 x 800
  at most, about 50 KB), saved in `server/data/photos` (`PHOTOS_DIR`), and downloaded by each gate so they
  still show when the server is offline. A new photo shows the next time the student taps.
- **Log by LRN** (admin and staff): for a student without their card, type their 12-digit LRN at the
  office and click **Log attendance**. It counts like a tap (time in, lunch, time out) and texts the
  parent the same way, marked "Office" and "LRN". The list shows everyone logged by LRN today, here or at
  a gate's LRN box.
- **Reports and files**: **Download student attendance** as Excel: **Daily** or **Monthly**, one section
  or all, with **Separate male and female** (a Male and a Female sheet per section) or both together.
  Monthly files use the layout of DepEd School Form 2 (SF2): a column for each weekday (blank = present,
  x = absent, L = late, LB = late from lunch, H = holiday), absences and tardies per student, and present
  totals per day. Daily files list each student's time in, time out, status and notes. The school name
  on the sheets comes from `SCHOOL_NAME` in `server/.env`; students with no sex set are listed under "Not
  specified". **Show the attendance on screen** has the same numbers as a table, a CSV download and
  printing. Absent counts only school days (weekdays not in the holiday list at the bottom, added by
  admins), from the day each student was added.
  **School templates**: the school's SF2 form and student list template. **Replace** (admin and staff)
  uploads the school's newest version, and every **Download** gives that one.
  **Directory folder**: every Excel download is also saved on the server PC, in one folder per school
  year and section (`School year 2026-2027/Grade 11 - STEM A/...`). Downloading the same report again
  replaces the copy with the newer numbers. The folder is `server/data/reports` (`REPORTS_DIR`) until an
  admin uses **Change folder** (for example `C:\Tap-Tap Mo\Reports`).
- **Lunch and SMS settings** (admins): the lunch break and the time students must be back by, and the
  text parents get when their child is late from lunch. The words in brackets ([Student name],
  [section], [time], [date], [cutoff]) are filled in for each student; the page shows an example and
  refuses a text that wouldn't fit in one SMS credit. **SMS provider**: test mode (texts are printed in
  the server window), or **Semaphore** with the API key and an approved sender name from the school's
  Semaphore account. **Send test text** checks the details before saving. Cast PH is listed but can't
  be chosen until they send their API details. **Student ID number in the API** shows a record from
  `GET /api/attendance/records?date=YYYY-MM-DD`, which lists every time in and out with the student's
  ID number (`id_number`), LRN, name, section, type, late or not, and `tapped_at` in Philippine time.
- **SMS log** (admin and staff): failed and waiting texts. For a wrong number, click **Change number**,
  verify the new number on **Verify numbers**, then click **Send again**.
- **Login**: after 5 wrong passwords, that username is locked for 15 minutes.

**Backups**

The server saves a copy of the database every day after 6:00 PM, or as soon as it starts if the newest
copy is over a day old, and keeps the newest 30. Set `BACKUP_DIR` in `server/.env` to an external drive
(for example `E:/tap-tap-mo-backups`). To make one right away:

```bash
npm run backup
```

To restore: stop the server, copy a backup over `server/data/tap-tap-mo.db`, delete
`tap-tap-mo.db-wal` and `tap-tap-mo.db-shm` in the same folder if they exist, and start the server.
Student photos are kept as one up-to-date copy in the `photos` folder inside `BACKUP_DIR`; to restore
them, copy its files into `server/data/photos`.
Backups hold students' and parents' personal data and photos (Data Privacy Act), so keep the drive locked away.

## Sending real texts with Semaphore

The school uses Semaphore (semaphore.co, [API docs](https://semaphore.co/docs)) for now. Its API key is
in `server/.env` (`SEMAPHORE_API_KEY`), so the system is ready, but texts stay in test mode until the
Semaphore account can send:

1. **Account active**: on semaphore.co the account must no longer be "Pending".
2. **Credits loaded**: each text uses 1 credit (texts that fail are refunded).
3. **Sender name approved**: under Sender Names, add `BCNHS` (the name every text starts with) and wait
   for approval. Without an approved sender name Semaphore can't send at all.
4. On **Lunch and SMS settings**, choose **Semaphore**, keep the sender name `BCNHS`, leave the API key
   box empty (it uses the one in `.env`), and send a **test text** to your own phone. Then click
   **Save provider**. Saving checks the account first: it refuses a sender name that isn't approved
   (every text would fail) and warns about 0 credits.

Semaphore allows 120 texts a minute, so the queue sends about 109 a minute; at the morning rush the
rest wait a few seconds. Delivery is checked for all sent texts with one request every 30 seconds.
Texts that start with "TEST" are ignored by Semaphore, so a sender name can't start with it.

## Keeping secrets safe

The secrets are only in two files, both kept out of Git (`.gitignore`): `server/.env` on the server PC
and `gate-app/config.json` on each gate PC. Never put a real value in `.env.example`, the README, or a
message. If one leaks, replace it (for the Semaphore key: make a new key on semaphore.co).

| Secret | What it protects |
|---|---|
| `SESSION_SECRET` | Staff logins. Anyone who knows it could pretend to be logged in. |
| `GATE_KEYS` | Which PCs can send taps. Each gate's key is also its `gateKey` in that gate PC's `gate-app/config.json`. |
| `SECRETS_KEY` | Encrypts API keys typed on Lunch and SMS settings before they are saved in the database. |
| `SEMAPHORE_API_KEY` | The school's Semaphore account (and its credits). |

Make a new random value with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Restart the server (and the gate apps, for new gate keys) after changing them. Changing
`SESSION_SECRET` logs everyone out. The server prints a warning at startup if one is missing or is
still a placeholder from `.env.example`.

How the system keeps them safe:
- The API key never reaches a page: Lunch and SMS settings only shows where it is saved and its last 4
  characters. It is never written to the logs, the SMS log, or error messages (they show `***`).
- A key typed on the dashboard is saved encrypted (AES-256-GCM with `SECRETS_KEY`), so the database
  and its backups don't reveal it. Keep a copy of `server/.env` somewhere safe (not with the backups):
  without `SECRETS_KEY` a saved key must be typed again.
- The key is only sent to Semaphore, over HTTPS: the settings page refuses any other API address.
- Pages only run the dashboard's own scripts and can't be shown inside other sites (security headers),
  login cookies can't be read by scripts, and browsers don't keep copies of API replies, which hold
  students' and parents' data.

## Status

Built: the tap-to-text flow (gate screen, offline outbox, tap processing, SMS queue with retries and
delivery status, test mode and Semaphore SMS providers), staff login, student and card registration
with parent number verification, Excel and CSV import of students, tap-to-assign cards by class, card
numbers, student photos, verifying parent numbers a class at a time, the dashboard, the Students page
with section sizes, Log by LRN, daily and monthly Excel reports (SF2, male and female sheets) saved in
a folder per section, school templates, Lunch and SMS settings, the attendance records API, SMS log
with retry, holidays, daily backups, and a login lock.
The Semaphore key works (the account and sender names were read with it). No real text has been sent
yet: the account is still pending, with no credits and no approved sender name. Sending, delivery
checks and errors were tested against a stand-in server that answers like Semaphore's API.
Not built yet: Cast PH provider, replacing lost cards, and deactivating students. Routes that are not built yet answer `501 Not implemented`.

## To confirm with Cast PH

API endpoint and authentication; how to check delivery status without webhooks (the server is only on
the school network); credit balance API; error codes for invalid numbers; registering "BCNHS" as the sender name.
