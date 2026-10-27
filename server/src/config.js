// Reads settings from environment variables (.env). See .env.example for the full list.
const path = require('node:path');

// "gate1:key1,gate2:key2" -> { gate1: 'key1', gate2: 'key2' }
function parseGateKeys(raw = '') {
  return Object.fromEntries(
    raw.split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
      const [id, ...rest] = pair.split(':');
      return [id.trim(), rest.join(':').trim()];
    })
  );
}

// "8:00" or "08:00" or "08:00:00" -> "08:00:00", so times compare correctly as text
function hhmmss(time) {
  const [h = '0', m = '0', s = '0'] = String(time).trim().split(':');
  return [h, m, s].map((part) => part.padStart(2, '0')).join(':');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || 'data/tap-tap-mo.db'),
  timeZone: process.env.SCHOOL_TZ || 'Asia/Manila',
  // The school day (24-hour times). See services/attendance.js for how taps are read.
  schedule: {
    lateAfter: hhmmss(process.env.LATE_AFTER || '08:00'),       // classes start; arriving after this is late
    lunchStart: hhmmss(process.env.LUNCH_START || '12:00'),     // taps out from here are lunch, not early out
    lunchEnd: hhmmss(process.env.LUNCH_END || '13:00'),         // coming back after this is late from lunch
    dismissal: hhmmss(process.env.DISMISSAL_TIME || '16:00'),   // time out starts; leaving before is early out
  },
  cooldownMs: (Number(process.env.COOLDOWN_SECONDS) || 30) * 1000,
  // Students without their card can type their 12-digit LRN at the gate. Set to false to turn it off.
  allowLrnEntry: process.env.ALLOW_LRN_ENTRY !== 'false',
  gateKeys: parseGateKeys(process.env.GATE_KEYS),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret',
  // Page the server loads every minute to see if the internet is up (a tiny page made for this).
  internetCheckUrl: process.env.INTERNET_CHECK_URL || 'https://www.google.com/generate_204',
  backup: {
    dir: path.resolve(__dirname, '..', process.env.BACKUP_DIR || 'backups'), // can be an external drive, e.g. E:/backups
    time: process.env.BACKUP_TIME || '18:00',  // daily backup after this time (school time)
    keep: Number(process.env.BACKUP_KEEP) || 30, // how many daily copies to keep
  },
  sms: {
    provider: process.env.SMS_PROVIDER || 'mock',
    senderName: process.env.SMS_SENDER_NAME || 'BCNHS',
    retrySeconds: Number(process.env.SMS_RETRY_SECONDS) || 60,
    castph: {
      apiUrl: process.env.CASTPH_API_URL,
      apiKey: process.env.CASTPH_API_KEY,
    },
  },
};
