// Lunch and SMS settings (admins): lunch times and the late-from-lunch text, the SMS provider, and an
// example of the attendance API with the student's ID number.
const $ = (id) => document.getElementById(id);
let saved = null; // the settings from the server
const PLAIN_SMS = /^[A-Za-z0-9 .,:;!?'"()\-/@&%#*+=<>_\n\rñÑéèùìòàÄÖÜäöüÅåÇØø£$¥]*$/; // same as messages.js

// "13:00" -> "1:00 PM"
function clock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---- Lunch ----
function showLunchBoxes() {
  const start = $('lunch-start').value || saved.lunch.start;
  const end = $('lunch-end').value || saved.lunch.end;
  $('quiet-title').textContent = `${clock(start)} to ${clock(end)}`;
  $('late-title').textContent = `After ${clock(end)}`;
  showExample();
}

// Fills in the text the way the server does, for a sample student.
function showExample() {
  const end = $('lunch-end').value || saved.lunch.end;
  const [h, m] = end.split(':').map(Number);
  const minutes = h * 60 + m + 12; // a student back 12 minutes after the cutoff
  const late = clock(`${Math.floor(minutes / 60) % 24}:${String(minutes % 60).padStart(2, '0')}`);
  const values = { 'student name': 'Juan Dela Cruz', section: 'Grade 11 - STEM A', time: late, date: 'Nov 13', cutoff: clock(end) };
  const text = $('late-text').value.replace(/\[([^\]]*)\]/g, (whole, word) => values[word.trim().toLowerCase()] ?? whole);
  $('example').textContent = text;
  const unknown = [...$('late-text').value.matchAll(/\[([^\]]*)\]/g)].map((x) => x[1]).filter((w) => !(w.trim().toLowerCase() in values));
  let note = `${text.length} of 160 characters. Fits in one SMS credit.`;
  let over = false;
  if (unknown.length) [note, over] = [`"[${unknown[0]}]" isn't a word the system can fill in.`, true];
  else if (!PLAIN_SMS.test(text)) [note, over] = ['It has a character SMS can\'t send as plain text (like an emoji or a curly quote).', true];
  else if (text.length > 160) [note, over] = [`${text.length} characters: over the 160 that fit in one SMS credit. Make it shorter.`, true];
  $('counter').textContent = note;
  $('counter').className = `counter ${over ? 'over' : ''}`;
}

$('lunch-start').addEventListener('input', showLunchBoxes);
$('lunch-end').addEventListener('input', showLunchBoxes);
$('late-text').addEventListener('input', showExample);
$('default-text').addEventListener('click', () => {
  $('late-text').value = saved.lunch.defaultLateText;
  showExample();
});

$('save-lunch').addEventListener('click', async () => {
  try {
    saved = await api('/settings/lunch', {
      method: 'PUT',
      body: { start: $('lunch-start').value, end: $('lunch-end').value, lateText: $('late-text').value },
    });
    showMessage($('lunch-message'), 'ok', `Saved. Lunch is ${clock(saved.lunch.start)} to ${clock(saved.lunch.end)} from the next tap.`);
  } catch (err) {
    showMessage($('lunch-message'), 'error', err.message);
  }
});

// ---- SMS provider ----
const PROVIDER_TEXT = {
  mock: 'Test mode: texts are printed in the server window instead of being sent. Nothing reaches parents and no credits are used.',
  semaphore: 'After you save, parent texts go through Semaphore. Each text uses one credit from the school\'s Semaphore account. '
    + 'The sender name must be one approved on that account. The API key is saved encrypted and is never shown again.',
  castph: 'Cast PH can\'t be used yet: the system needs their API details first.',
};

function showProviderForm() {
  const provider = $('provider').value;
  const isMock = provider === 'mock';
  $('api-url').disabled = isMock;
  $('api-key').disabled = isMock;
  if (provider === 'semaphore' && !$('api-url').value) $('api-url').value = saved.sms.semaphoreUrl;
  const hint = saved.sms.apiKeyHints[provider];
  $('api-key').placeholder = hint ? `${hint}. Leave empty to keep it` : 'From your provider account';
  $('sms-hint').textContent = PROVIDER_TEXT[provider] ?? '';
}

function showProviderStatus() {
  const live = saved.sms.provider !== 'mock';
  const label = saved.sms.providers.find((p) => p.value === saved.sms.provider)?.label ?? saved.sms.provider;
  $('provider-status').textContent = live ? `Live: texts go through ${label}` : 'Test mode, no texts sent';
  $('provider-status').className = `status-pill ${live ? 'live' : ''}`;
}

const smsForm = () => ({
  provider: $('provider').value,
  senderName: $('sender-name').value,
  apiUrl: $('api-url').value,
  apiKey: $('api-key').value,
});

$('provider').addEventListener('change', showProviderForm);

$('save-sms').addEventListener('click', async () => {
  try {
    $('save-sms').disabled = true;
    saved = await api('/settings/sms', { method: 'PUT', body: smsForm() });
    $('api-key').value = '';
    showProviderForm();
    showProviderStatus();
    showMessage($('sms-message'), saved.warnings.length ? 'info' : 'ok',
      ['Saved. The next texts use these settings.', ...saved.warnings].join(' '));
  } catch (err) {
    showMessage($('sms-message'), 'error', err.message);
  } finally {
    $('save-sms').disabled = false;
  }
});

$('send-test').addEventListener('click', async () => {
  $('send-test').disabled = true;
  showMessage($('sms-message'), 'info', 'Sending the test text...');
  try {
    const reply = await api('/settings/sms/test', { method: 'POST', body: { ...smsForm(), to: $('test-to').value } });
    showMessage($('sms-message'), 'ok', reply.message);
  } catch (err) {
    showMessage($('sms-message'), 'error', err.message);
  } finally {
    $('send-test').disabled = false;
  }
});

// ---- Attendance API example ----
async function showApiExample() {
  const day = new Date();
  for (let i = 0; i < 10; i++) {
    const date = new Date(day.getTime() - i * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const { records } = await api(`/attendance/records?date=${date}`);
    const record = records.find((r) => r.id_number) ?? records[0];
    if (record) {
      $('api-example').textContent = `GET /api/attendance/records?date=${date}\n\n`
        + JSON.stringify({ id_number: record.id_number, name: record.name, type: record.type, late: record.late, tapped_at: record.tapped_at }, null, 2);
      return;
    }
  }
  $('api-example').textContent = 'GET /api/attendance/records?date=2026-11-13\n\n{ "id_number": "2026-0041", "tapped_at": "2026-11-13T07:42:00+08:00" }';
}

async function load() {
  saved = await api('/settings');
  $('lunch-start').value = saved.lunch.start;
  $('lunch-end').value = saved.lunch.end;
  $('late-text').value = saved.lunch.lateText;
  showLunchBoxes();
  $('provider').replaceChildren(...saved.sms.providers.map((p) => new Option(p.value === 'castph' ? `${p.label} (not available yet)` : p.label, p.value)));
  $('provider').value = saved.sms.provider;
  $('sender-name').value = saved.sms.senderName;
  $('api-url').value = saved.sms.apiUrl;
  showProviderForm();
  showProviderStatus();
}

load().then(showApiExample).catch((err) => showMessage($('page-message'), 'error',
  err.message === 'Not allowed' ? 'Only admins can change these settings.' : err.message));
