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
│   │   │   ├── students.js     Student records, CSV import
│   │   │   ├── cards.js        Link, replace, deactivate RFID cards
│   │   │   ├── verification.js Parent mobile number code
│   │   │   ├── attendance.js   Today's taps and counts (dashboard)
│   │   │   ├── sms.js          SMS log, failed texts, retry, credits
│   │   │   ├── reports.js      Daily and monthly reports, CSV and Excel (SF2) export
│   │   │   ├── holidays.js     No-class days
│   │   │   └── backups.js      Latest backup, back up now
│   │   ├── services/           The actual logic
│   │   │   ├── attendance.js   What a tap means: time in, lunch, late, early out, time out
│   │   │   ├── smsQueue.js     Background sending and retries
│   │   │   ├── messages.js     Text templates (one SMS credit each)
│   │   │   ├── studentImport.js  Reading and checking CSV student lists
│   │   │   ├── verification.js   Parent number codes (one student or a whole class)
│   │   │   ├── attendanceReports.js  Dashboard counts, daily and monthly reports
│   │   │   ├── sf2.js          Monthly attendance as an Excel file in the SF2 layout
│   │   │   ├── schoolDays.js   Weekdays that aren't holidays
│   │   │   ├── smsLog.js       SMS log, today's counts, retrying texts
│   │   │   ├── internet.js     Checks every minute whether the internet is up
│   │   │   ├── backup.js       Daily database backup
│   │   │   └── sms/            SMS providers, all with the same functions
│   │   │       ├── index.js    Picks the provider from SMS_PROVIDER
│   │   │       ├── mockProvider.js    Prints texts to the console (development)
│   │   │       └── castphProvider.js  Real texts (after Cast PH gives API details)
│   │   ├── middleware/         Gate key check, staff login check
│   │   └── utils/time.js       Dates and times in Asia/Manila
│   └── public/                 Staff dashboard (HTML, CSS, JS)
│
└── gate-app/                   Runs on each gate PC (Electron)
    ├── config.example.json     Server address, gate id and key: copy to config.json
    └── src/
        ├── main.js             Opens the gate window, handles taps
        ├── preload.js          Safe bridge between the screen and main.js
        ├── outbox.js           Taps waiting to be uploaded (saved to disk first)
        ├── roster.js           Local card -> name list for offline mode
        ├── sync.js             Uploads taps, downloads the roster
        └── renderer/           The gate screen (Figure 3: waiting, ok, offline, not registered)
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

1. **Import students**: upload the enrollment list (for example the SF1 School Register) saved from
   Excel as **CSV UTF-8**, or fill in the template on that page. You see a preview of every row first,
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

Set in `server/.env` (restart the server after changing them):

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

- **Dashboard**: today's present, late and absent counts, texts sent, internet and SMS credit status,
  the last backup (admins), failed texts, and every tap with its text status. It updates every 15 seconds.
  Its **This week** summary shows average attendance and tardiness (the share of arrivals that were
  late), each compared with the week before, plus late arrivals, absences, attendance and lateness by
  day, and the students most often late. Use the arrows for earlier weeks; the class filter at the top
  applies to the whole page. Today counts once classes have started. Next to the class filter it shows
  how many students are enrolled (male and female) in the class or the whole school.
- **Students**: how many students there are, male and female, per section and in total, and the list
  of every student with their card number, LRN, school ID and parent number. Search by name, card
  number, LRN or school ID, or filter by section and sex. **Edit** opens the student on Register card.
- **SMS log** (admin and staff): failed and waiting texts. For a wrong number, click **Change number**,
  verify the new number on **Verify numbers**, then click **Send again**.
- **Reports**: daily or monthly attendance for one class or all, as a table, a CSV file for Excel, or
  printed / saved as PDF. Absent counts only school days: weekdays that aren't in the holiday list (admins
  add holidays at the bottom of the Reports page), counted from the day each student was added.
  **Download Excel (SF2)** gives the month in the layout of DepEd School Form 2: one sheet per section,
  boys then girls, a column for each weekday (blank = present, x = absent, L = late, LB = late from
  lunch, H = holiday), absences and tardies per student, and present totals per day for boys, girls and
  both. The school name on the sheet comes from `SCHOOL_NAME` in `server/.env`. Students with no sex set
  are listed under "Not specified" until it's filled in.
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
Backups hold students' and parents' personal data (Data Privacy Act), so keep the drive locked away.

## Status

Built: the tap-to-text flow (gate screen, offline outbox, tap processing, SMS queue with retries and
delivery status, mock SMS provider), staff login, student and card registration with parent number
verification, CSV import of students, tap-to-assign cards by class, card numbers, verifying parent
numbers a class at a time, the dashboard, the Students page, SMS log with retry, daily and monthly
reports with the SF2 Excel file, holidays, daily backups, and a login lock.
Not built yet: Cast PH provider, replacing lost cards, and deactivating students. Routes that are not built yet answer `501 Not implemented`.

## To confirm with Cast PH

API endpoint and authentication; how to check delivery status without webhooks (the server is only on
the school network); credit balance API; error codes for invalid numbers; registering "BCNHS" as the sender name.
