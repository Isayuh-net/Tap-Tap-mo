// Settings changed on the dashboard, saved in the settings table. They take the place of the
// values in .env (config.js), so the school can change lunch times or the SMS provider without
// editing files or restarting the server.
//   lunch          { start, end }    'HH:MM:SS', replaces LUNCH_START and LUNCH_END
//   lunchLateText  text              the late-from-lunch text, with [Student name] etc. (messages.js)
//   sms            { provider, senderName, apiUrl, apiKeys: { semaphore: encrypted } }   replaces SMS_PROVIDER etc.
//   reportsDir     folder            where Excel downloads are saved (reportFiles.js)
//   template:<kind>                  an uploaded school template (templates.js)
const db = require('../db');
const config = require('../config');
const secrets = require('./secrets');

const getRow = db.prepare('SELECT value FROM settings WHERE key = ?');
const setRow = db.prepare(`
  INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);
const removeRow = db.prepare('DELETE FROM settings WHERE key = ?');

function get(key, fallback = null) {
  const row = getRow.get(key);
  return row ? JSON.parse(row.value) : fallback;
}

// null or undefined removes the setting, so .env applies again.
function set(key, value) {
  if (value === null || value === undefined) removeRow.run(key);
  else setRow.run(key, JSON.stringify(value), new Date().toISOString());
}

// The API key for a provider: one typed on the dashboard (saved encrypted, see secrets.js), or the
// one in .env (SEMAPHORE_API_KEY). Returns { apiKey, source: 'dashboard' | 'env' | null }.
function apiKeyFor(provider) {
  const saved = secrets.decrypt(get('sms')?.apiKeys?.[provider]);
  if (saved) return { apiKey: saved, source: 'dashboard' };
  const fromEnv = config.sms[provider]?.apiKey;
  return fromEnv ? { apiKey: fromEnv, source: 'env' } : { apiKey: '', source: null };
}

// The SMS provider and its details: saved on the dashboard, or from .env until then.
// { provider, senderName, apiUrl, apiKey, apiKeySource }
function sms() {
  const saved = get('sms');
  const provider = saved?.provider ?? config.sms.provider;
  const { apiKey, source } = apiKeyFor(provider);
  return {
    provider,
    senderName: saved?.senderName ?? config.sms.senderName,
    apiUrl: saved?.apiUrl || config.sms[provider]?.apiUrl || '',
    apiKey,
    apiKeySource: source,
  };
}

// Older versions saved one API key as plain text ({ apiKey }). It is encrypted the first time the
// server starts with SECRETS_KEY set.
function encryptOldKey() {
  const saved = get('sms');
  if (!saved?.apiKey || !secrets.canEncrypt()) return;
  const { apiKey, ...rest } = saved;
  set('sms', { ...rest, apiKeys: { ...rest.apiKeys, [saved.provider]: secrets.encrypt(apiKey) } });
}
encryptOldKey();

// Lunch times from .env, kept so the page can show them as the default.
const envLunch = { start: config.schedule.lunchStart, end: config.schedule.lunchEnd };

// Saved lunch times replace the ones from .env. decideTap() reads config.schedule on every tap,
// so a change applies to the next tap.
function applyLunch() {
  const lunch = get('lunch') ?? envLunch;
  config.schedule.lunchStart = lunch.start;
  config.schedule.lunchEnd = lunch.end;
}
applyLunch();

module.exports = { get, set, sms, apiKeyFor, applyLunch };
