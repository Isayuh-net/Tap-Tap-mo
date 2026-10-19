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
│   │   │   ├── attendance.js   Today's taps and counts
│   │   │   ├── sms.js          SMS log, failed texts, credits
│   │   │   └── reports.js      Daily and monthly reports, export
│   │   ├── services/           The actual logic
│   │   │   ├── attendance.js   Time in/out toggle, cooldown, late detection
│   │   │   ├── smsQueue.js     Background sending and retries
│   │   │   ├── messages.js     Text templates (one SMS credit each)
│   │   │   ├── studentImport.js  Reading and checking CSV student lists
│   │   │   ├── backup.js       Nightly database backup
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
| US-05 | Verify parent mobile number | `server/src/routes/verification.js`, `public/register.html` |
| US-06, US-14 | Gate screen feedback | `gate-app/src/renderer/` |
| US-07 | Tap saved when offline | `gate-app/src/outbox.js`, `sync.js` |
| US-08 | Replace lost card | `server/src/routes/cards.js` |
| US-09, US-10 | Today's attendance and text status | `server/src/routes/attendance.js`, `public/index.html` |
| US-11 | Queued and failed texts | `server/src/routes/sms.js`, `public/sms-log.html` |
| US-12 | Texts sent and credits left | `server/src/routes/sms.js` |
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
2. **Assign cards**: choose a class and tap cards one after another. Each tap goes to the next student
   without a card. Use **Skip** for absent students and **Undo last card** for a wrong tap.
3. **Verify numbers**: choose a class and click **Send codes**. Every unverified parent with a number gets
   a code that works for 3 days. Parents give the code to their child, and the adviser types it in on
   the same page. Texts that fail (usually a wrong number) are shown so staff can fix the number.
   Sending again skips parents who already have a working code. Advisers (teacher accounts) can enter
   codes; only admin and staff can send texts, since each one uses an SMS credit.

To recognize your school's own column names, add them to `COLUMN_NAMES` in
`server/src/services/studentImport.js`.

**Register a student and card**

Plug a USB reader into the computer with the dashboard, open **Register card**, tap the card, fill in the
student and parent details, and click **Save and send verification code**. In test mode the code is
printed in the server terminal instead of texted; type it in and click **Verify**. Only verified numbers
get attendance texts. If the parent isn't there, save anyway and tap the same card later to finish.

Shortcut for test data: `add-student` registers a card and marks the number verified in one step.
Find the card's number by tapping it while Notepad is open: the reader types it.

```bash
npm run add-student -- --uid 0004567890 --name "Stephanie Lei Polonio" --grade 12 --strand STEM --section A --mobile 09170005590
```

Restart the gate app (or wait 5 minutes) so it downloads new names for offline mode.

**Things to try**

| Try this | What should happen |
|---|---|
| Tap a registered card | Green "TIME IN" screen; the text appears in the server terminal |
| Tap it again within 30 seconds | "ALREADY TAPPED", no text |
| Tap it again after 30 seconds | "TIME OUT", and a "left school" text |
| Tap an unregistered card | Red "Card not registered" screen showing the card number |
| Stop the server, then tap | Orange "OFFLINE: TAP SAVED" with the student's name |
| Start the server again | Within 5 seconds the saved taps upload and their texts go out |
| Register a number ending in `0000` | The text is marked failed (invalid number) |
| Set `MOCK_SMS_FAIL_RATE=1`, restart the server, tap | The text stays queued and retries; set it back to `0` and it sends |

## Status

Built: the tap-to-text flow (gate screen, offline outbox, tap processing, SMS queue with retries and
delivery status, mock SMS provider), staff login, student and card registration with parent number
verification, CSV import of students, tap-to-assign cards by class, and verifying parent numbers a class at a time.
Not built yet: Cast PH provider, replacing lost cards, and the dashboard, students, SMS log and reports pages. Routes that are not built yet answer `501 Not implemented`.

## To confirm with Cast PH

API endpoint and authentication; how to check delivery status without webhooks (the server is only on
the school network); credit balance API; error codes for invalid numbers; registering "BCNHS" as the sender name.
