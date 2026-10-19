// SMS log page: list texts by status, send failed ones again, and correct parents' numbers. (US-11)
const $ = (id) => document.getElementById(id);
const message = $('message');

const STATUS_BADGES = {
  delivered: ['ok', 'Delivered'],
  sent: ['new', 'Sent'],
  queued: ['waiting', 'Waiting'],
  sending: ['waiting', 'Sending'],
  failed: ['error', 'Failed'],
};

// Open with a filter from the link, e.g. sms-log.html?status=failed
const startStatus = new URLSearchParams(location.search).get('status');
if (startStatus) $('status').value = startStatus;

function cell(tr, ...content) {
  const td = document.createElement('td');
  td.append(...content.filter((c) => c !== null && c !== undefined && c !== ''));
  tr.append(td);
  return td;
}
const div = (className, text) => Object.assign(document.createElement('div'), { className, textContent: text });
const button = (text, onClick) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text });
  b.addEventListener('click', onClick);
  return b;
};

async function load() {
  const params = new URLSearchParams({ status: $('status').value });
  if ($('date').value) params.set('date', $('date').value);
  try {
    const { texts } = await api(`/sms?${params}`);
    $('count').textContent = `${texts.length} text${texts.length === 1 ? '' : 's'}${texts.length === 500 ? ' (showing the newest 500)' : ''}.`;
    $('rows').replaceChildren(...texts.map(renderRow));
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
}

function renderRow(m) {
  const tr = document.createElement('tr');
  cell(tr, m.createdAt);
  cell(tr, m.name ?? '(no student)', m.classLabel ? div('note', m.classLabel) : null);
  const text = cell(tr, m.kindLabel);
  text.title = m.body; // hover to read the whole text

  const numberChanged = m.currentMobile && m.currentMobile !== m.toMobile;
  cell(tr, m.toMobile, numberChanged ? div('note warning', `Number is now ${m.currentMobile}${m.mobileVerified ? '' : ' (not verified)'}`) : null);

  const [kind, label] = STATUS_BADGES[m.status] ?? ['waiting', m.status];
  cell(tr,
    Object.assign(document.createElement('span'), { className: `badge ${kind}`, textContent: label }),
    m.lastError ? div('note problem', m.lastError) : null,
    m.status === 'queued' && m.attempts ? div('note', `Tried ${m.attempts} time(s). Next try ${m.nextAttemptAt}`) : null);

  const actions = cell(tr);
  actions.className = 'actions-cell';
  const needsWork = ['failed', 'queued'].includes(m.status);
  if (needsWork && m.kind !== 'verification') actions.append(button('Send again', () => retry(m)));
  if (needsWork && m.kind === 'verification') actions.append(Object.assign(document.createElement('a'), { href: 'verify-class.html', textContent: 'Send a new code' }));
  if (needsWork && m.studentId) actions.append(button('Change number', () => changeNumber(m)));
  return tr;
}

async function retry(m) {
  try {
    const r = await api(`/sms/${m.id}/retry`, { method: 'POST' });
    showMessage(message, 'ok', `${m.name}'s text is queued again, to ${r.to}.`);
    load();
  } catch (err) {
    showMessage(message, 'error', `${m.name ?? 'Text'}: ${err.message}`);
  }
}

async function changeNumber(m) {
  const typed = prompt(`New parent mobile number for ${m.name}:`, m.currentMobile ?? m.toMobile);
  if (typed === null) return;
  try {
    const student = await api(`/students/${m.studentId}/mobile`, { method: 'PATCH', body: { guardianMobile: typed } });
    showMessage(message, student.mobileVerified ? 'ok' : 'info', student.mobileVerified
      ? `Number unchanged (${student.guardianMobile}).`
      : `Number changed to ${student.guardianMobile}. Verify it on Verify numbers, then click Send again.`);
    load();
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
}

$('status').addEventListener('change', load);
$('date').addEventListener('change', load);
load();
