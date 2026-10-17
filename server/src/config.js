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

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || 'data/tap-tap-mo.db'),
  timeZone: process.env.SCHOOL_TZ || 'Asia/Manila',
  lateAfter: process.env.LATE_AFTER || '07:30:00',
  cooldownMs: (Number(process.env.COOLDOWN_SECONDS) || 30) * 1000,
  gateKeys: parseGateKeys(process.env.GATE_KEYS),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret',
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
