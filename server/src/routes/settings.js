// Lunch and SMS settings page (admins). Changes are saved in the settings table and apply to the
// next tap or text without restarting the server.
const express = require('express');
const config = require('../config');
const requireLogin = require('../middleware/requireLogin');
const settings = require('../services/settings');
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

// "abcd1234efgh" -> "Saved key ending in efgh", so the key itself never reaches the page
const keyHint = (key) => (key ? `Saved key ending in ${key.slice(-4)}` : '');

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
      apiKeyHint: keyHint(s.apiKey),
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

// The provider details from the page, with the saved API key when the box was left empty.
function smsOptions(body) {
  const saved = settings.sms();
  const provider = String(body?.provider ?? '');
  if (!sms.PROVIDERS[provider]) throw httpError(400, 'Choose an SMS provider.');
  if (provider === 'castph') {
    throw httpError(400, 'Cast PH can\'t be used yet: the system needs their API details first. Use Semaphore or test mode for now.');
  }
  const senderName = String(body?.senderName ?? '').trim();
  if (!/^[A-Za-z0-9 ]{1,11}$/.test(senderName)) {
    throw httpError(400, 'The sender name must be 1 to 11 letters or numbers (for example BCNHS).');
  }
  const apiUrl = String(body?.apiUrl ?? '').trim();
  if (apiUrl && !/^https?:\/\/\S+$/.test(apiUrl)) throw httpError(400, 'The API URL must start with https://');
  const newKey = String(body?.apiKey ?? '').trim();
  const apiKey = newKey || (saved.provider === provider ? saved.apiKey : '');
  if (provider === 'semaphore' && !apiKey) throw httpError(400, 'Enter the API key from your Semaphore account.');
  return { provider, senderName, apiUrl: provider === 'mock' ? '' : apiUrl, apiKey: provider === 'mock' ? '' : apiKey };
}

// Body: { provider, senderName, apiUrl, apiKey (empty = keep the saved one) }
router.put('/sms', (req, res) => {
  settings.set('sms', smsOptions(req.body));
  res.json(current());
});

// Sends one text with the details on the page (saved or not), without the queue.
// Body: the same as above, plus { to }
router.post('/sms/test', async (req, res) => {
  const options = smsOptions(req.body);
  const to = normalizeMobile(req.body?.to);
  if (!to) throw httpError(400, 'Enter a mobile number like 09171234567.');
  const body = `${options.senderName}: This is a test text from Tap-Tap Mo. Parent texts will come from this sender.`;
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
