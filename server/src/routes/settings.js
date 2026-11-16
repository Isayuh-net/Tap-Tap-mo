// Lunch and SMS settings page (admins). Changes are saved in the settings table and apply to the
// next tap or text without restarting the server.
const express = require('express');
const config = require('../config');
const requireLogin = require('../middleware/requireLogin');
const settings = require('../services/settings');
const secrets = require('../services/secrets');
const messages = require('../services/messages');
const sms = require('../services/sms');
const { DEFAULT_URL: SEMAPHORE_URL } = require('../services/sms/semaphoreProvider');
const { normalizeMobile } = require('../utils/normalize');
const { clockLabel } = require('../utils/time');
const { httpError } = require('../utils/httpError');

const router = express.Router();
router.use(requireLogin('admin'));

// "7:5" or "07:05" or "07:05:00" -> "07:05:00", or null when it isn't a time
function toTime(text) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(text ?? '').trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}:00`;
}

// Where the provider's API key is, ending with its last 4 characters. The key itself never
// reaches the page.
function keyHint(provider) {
  const { apiKey, source } = settings.apiKeyFor(provider);
  if (!apiKey) return '';
  return source === 'env' ? `Saved in server/.env (ending in ${apiKey.slice(-4)})` : `Saved, encrypted (ending in ${apiKey.slice(-4)})`;
}

function current() {
  const s = settings.sms();
  return {
    lunch: {
      start: config.schedule.lunchStart.slice(0, 5),
      end: config.schedule.lunchEnd.slice(0, 5),
      lateAfter: clockLabel(config.schedule.lateAfter),
      dismissal: clockLabel(config.schedule.dismissal),
      lateText: settings.get('lunchLateText') ?? messages.defaultLunchLateText(),
      defaultLateText: messages.defaultLunchLateText(),
    },
    sms: {
      provider: s.provider,
      senderName: s.senderName,
      apiUrl: s.apiUrl,
      apiKeyHints: Object.fromEntries(Object.keys(sms.PROVIDERS).map((p) => [p, keyHint(p)])),
      providers: Object.entries(sms.PROVIDERS).map(([value, p]) => ({ value, label: p.label })),
      semaphoreUrl: SEMAPHORE_URL,
    },
  };
}

router.get('/', (req, res) => res.json(current()));

// Checks the late-from-lunch text: known words in brackets, plain SMS characters, and one credit
// for a student with a long-ish name.
function checkLateText(text) {
  const unknown = messages.unknownWords(text);
  if (unknown.length) {
    throw httpError(400, `"[${unknown[0]}]" isn't a word the system can fill in. Use [Student name], [section], [time], [date] or [cutoff].`);
  }
  const sample = messages.fillLunchLate(text, { name: 'Maria Angelica Dela Cruz', classLabel: 'Grade 12 - HUMSS B', date: new Date() });
  if (!messages.PLAIN_SMS.test(sample)) {
    throw httpError(400, 'The text has a character that SMS can\'t send as plain text (like an emoji or a curly quote), which costs extra credits.');
  }
  if (sample.length > 160) {
    throw httpError(400, `With a long name the text is ${sample.length} characters, over the 160 that fit in one SMS credit. Make it shorter.`);
  }
}

// Body: { start: '12:00', end: '13:00', lateText }
router.put('/lunch', (req, res) => {
  const start = toTime(req.body?.start);
  const end = toTime(req.body?.end);
  if (!start || !end) throw httpError(400, 'Enter both lunch times.');
  if (end <= start) throw httpError(400, 'The time students must be back has to be after lunch starts.');
  if (start <= config.schedule.lateAfter) throw httpError(400, `Lunch has to start after classes start (${clockLabel(config.schedule.lateAfter)}).`);
  if (end > config.schedule.dismissal) throw httpError(400, `Students have to be back before dismissal (${clockLabel(config.schedule.dismissal)}).`);
  const lateText = String(req.body?.lateText ?? '').trim();
  if (!lateText) throw httpError(400, 'Write the text parents get when their child is late from lunch.');
  // Saving the default text unchanged keeps it as the default, so it follows a new sender name.
  const isDefault = lateText === messages.defaultLunchLateText();
  if (!isDefault) checkLateText(lateText); // before saving anything, so a refused text changes nothing

  settings.set('lunch', { start, end });
  settings.applyLunch(); // the next tap uses the new times
  settings.set('lunchLateText', isDefault ? null : lateText);
  res.json(current());
});

// The API key goes only to the provider's own servers (or this PC, for testing), over HTTPS.
const API_HOSTS = { semaphore: ['api.semaphore.co', 'semaphore.co'] };
const TEST_HOSTS = ['localhost', '127.0.0.1'];

function checkApiUrl(provider, apiUrl) {
  if (!apiUrl) return;
  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    throw httpError(400, 'The API URL isn\'t a web address.');
  }
  const testing = TEST_HOSTS.includes(url.hostname);
  if (url.protocol !== 'https:' && !testing) throw httpError(400, 'The API URL must start with https:// so the key is sent encrypted.');
  if (API_HOSTS[provider] && !API_HOSTS[provider].includes(url.hostname) && !testing) {
    throw httpError(400, `The API URL must be on ${API_HOSTS[provider][0]}, so the key only goes to ${sms.PROVIDERS[provider].label}.`);
  }
}

// The provider details from the page. An empty API key box means "keep the saved one" (typed
// before, or in server/.env). Returns { provider, senderName, apiUrl, apiKey, newKey }.
function smsOptions(body) {
  const provider = String(body?.provider ?? '');
  if (!sms.PROVIDERS[provider]) throw httpError(400, 'Choose an SMS provider.');
  if (provider === 'castph') {
    throw httpError(400, 'Cast PH can\'t be used yet: the system needs their API details first. Use Semaphore or test mode for now.');
  }
  const senderName = String(body?.senderName ?? '').trim();
  if (!/^[A-Za-z0-9 ]{1,11}$/.test(senderName)) {
    throw httpError(400, 'The sender name must be 1 to 11 letters or numbers (for example BCNHS).');
  }
  if (/^test/i.test(senderName)) throw httpError(400, 'The sender name can\'t start with "TEST": Semaphore ignores texts that start with that word.');
  if (provider === 'mock') return { provider, senderName, apiUrl: '', apiKey: '', newKey: '' };

  const apiUrl = String(body?.apiUrl ?? '').trim();
  checkApiUrl(provider, apiUrl);
  const newKey = String(body?.apiKey ?? '').trim();
  if (newKey && !/^[A-Za-z0-9]{16,64}$/.test(newKey)) throw httpError(400, 'That doesn\'t look like an API key (letters and numbers only).');
  const apiKey = newKey || settings.apiKeyFor(provider).apiKey;
  if (!apiKey) throw httpError(400, `Enter the API key from your ${sms.PROVIDERS[provider].label} account.`);
  return { provider, senderName, apiUrl, apiKey, newKey };
}

// Before switching parents' texts to Semaphore: is the sender name registered on the account, and are
// there credits? A sender name that isn't registered would make every text fail, so it is refused.
// Returns warnings to show; if Semaphore can't be asked right now, it says so and saves anyway.
async function checkAccount(options) {
  const provider = sms.build(options);
  if (!provider.checkAccount) return [];
  let account;
  try {
    account = await provider.checkAccount();
  } catch (err) {
    return [`Couldn't check the Semaphore account (${err.message}). Send a test text to make sure it works.`];
  }
  if (account.senderNames) {
    const active = account.senderNames.filter((s) => !s.status || /active|approved/i.test(s.status)).map((s) => s.name);
    if (!active.some((name) => name.toLowerCase() === options.senderName.toLowerCase())) {
      throw httpError(400, active.length
        ? `"${options.senderName}" isn't an approved sender name on your Semaphore account. Use one of: ${active.join(', ')}.`
        : 'Your Semaphore account has no approved sender name yet, so texts can\'t be sent. On semaphore.co, add one '
          + `(for example ${options.senderName}) under Sender Names, wait for approval, then save again.`);
    }
  }
  const warnings = [];
  if (account.credits === 0) warnings.push('The account has 0 credits: texts wait in the queue until credits are loaded.');
  if (account.status && !/active/i.test(account.status)) warnings.push(`Semaphore lists the account as "${account.status}".`);
  return warnings;
}

// Body: { provider, senderName, apiUrl, apiKey (empty = keep the saved one) }
router.put('/sms', async (req, res) => {
  const options = smsOptions(req.body);
  if (options.newKey && !secrets.canEncrypt()) {
    throw httpError(400, 'The key can\'t be saved safely: SECRETS_KEY is missing from server/.env. Ask the person who set up the server.');
  }
  const warnings = options.provider === 'mock' ? [] : await checkAccount(options);
  const saved = settings.get('sms') ?? {};
  settings.set('sms', {
    provider: options.provider,
    senderName: options.senderName,
    apiUrl: options.apiUrl,
    // Keys stay saved per provider (encrypted), so switching to test mode and back keeps them.
    apiKeys: { ...saved.apiKeys, ...(options.newKey ? { [options.provider]: secrets.encrypt(options.newKey) } : {}) },
  });
  res.json({ ...current(), warnings });
});

// Sends one text with the details on the page (saved or not), without the queue.
// Body: the same as above, plus { to }
router.post('/sms/test', async (req, res) => {
  const options = smsOptions(req.body);
  const to = normalizeMobile(req.body?.to);
  if (!to) throw httpError(400, 'Enter a mobile number like 09171234567.');
  const body = `${options.senderName}: Hello from Tap-Tap Mo. Parent texts will come from this sender.`;
  try {
    await sms.build(options).send({ to, body });
  } catch (err) {
    throw httpError(400, `The test text was not sent: ${err.message}`);
  }
  res.json({
    to,
    message: options.provider === 'mock'
      ? `Test mode: the text to ${to} was printed in the server window, not sent to the phone.`
      : `Test text sent to ${to}. It may take a minute to arrive.`,
  });
});

module.exports = router;
