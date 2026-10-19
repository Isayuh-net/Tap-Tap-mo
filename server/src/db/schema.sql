-- Tap-Tap Mo database schema (SQLite).
-- Times are stored as ISO 8601 text in UTC. school_date is the date in Asia/Manila (YYYY-MM-DD),
-- used for "today" queries and reports.

CREATE TABLE IF NOT EXISTS students (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lrn             TEXT UNIQUE,                 -- DepEd Learner Reference Number
  full_name       TEXT NOT NULL,
  grade_level     INTEGER NOT NULL CHECK (grade_level IN (11, 12)),
  strand          TEXT NOT NULL DEFAULT '',    -- e.g. "STEM", "ABM", "HUMSS", "TVL-ICT"
  section         TEXT NOT NULL,               -- e.g. "A"
  guardian_name   TEXT,
  guardian_mobile TEXT,                        -- stored as 09XXXXXXXXX
  mobile_verified_at TEXT,                     -- NULL = not verified, no attendance texts sent (US-05)
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A student can have several cards over time (lost cards, reused cards from graduates). (US-08)
CREATE TABLE IF NOT EXISTS cards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  uid            TEXT NOT NULL UNIQUE,         -- number typed by the USB reader
  student_id     INTEGER REFERENCES students(id),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lost', 'returned')),
  issued_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deactivated_at TEXT
);

-- Every tap from a gate, including rejected ones, so nothing is silently lost.
CREATE TABLE IF NOT EXISTS taps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_tap_id TEXT NOT NULL UNIQUE,          -- made by the gate app; stops duplicates when it re-uploads
  gate_id       TEXT NOT NULL,
  card_uid      TEXT NOT NULL,
  student_id    INTEGER REFERENCES students(id),
  tapped_at     TEXT NOT NULL,                 -- when the card was tapped (from the gate)
  received_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- when the server got it
  school_date   TEXT NOT NULL,
  result        TEXT NOT NULL CHECK (result IN ('time_in', 'time_out', 'cooldown', 'unregistered', 'inactive')),
  is_late       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_taps_student_date ON taps (student_id, school_date);
CREATE INDEX IF NOT EXISTS idx_taps_date ON taps (school_date);

-- Every text the system sends, with its delivery status. (US-10, US-11, US-12)
CREATE TABLE IF NOT EXISTS sms_messages (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  kind                TEXT NOT NULL CHECK (kind IN ('time_in', 'time_out', 'verification', 'absent')),
  tap_id              INTEGER REFERENCES taps(id),
  student_id          INTEGER REFERENCES students(id),
  to_mobile           TEXT NOT NULL,
  body                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed')),
  attempts            INTEGER NOT NULL DEFAULT 0,
  next_attempt_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  provider_message_id TEXT,
  last_error          TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at             TEXT,
  delivered_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_messages (status, next_attempt_at);

-- 6-digit codes texted to parents, at registration or to a whole class. Only the hash is stored. (US-05)
CREATE TABLE IF NOT EXISTS verification_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id),
  mobile      TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  created_at  TEXT                             -- when the code was texted
);

-- Staff accounts for the dashboard.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'teacher')),
  section       TEXT,                          -- advisers only see their own section
  active        INTEGER NOT NULL DEFAULT 1
);

-- Days with no classes, so students are not marked absent.
CREATE TABLE IF NOT EXISTS holidays (
  date TEXT PRIMARY KEY,                       -- YYYY-MM-DD
  name TEXT NOT NULL
);
