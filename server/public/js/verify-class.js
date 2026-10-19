// Verify numbers page: send codes to a whole class, then type in the codes students bring back.
const $ = (id) => document.getElementById(id);
const message = $('message');

let classFilter = null; // { gradeLevel, strand, section }
let students = [];
let canSend = false;    // only admin and staff can send texts (they cost credits)

const STATUS_ORDER = { pending: 0, 'not-sent': 1, 'no-number': 2, verified: 3 };

// plural(1, 'code') -> "1 code", plural(3, 'code') -> "3 codes"
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

currentUser.then((user) => {
  canSend = ['admin', 'staff'].includes(user.role);
  if (classFilter) render();
});

function statusOf(s) {
  if (s.mobileVerified) return 'verified';
  if (!s.guardianMobile) return 'no-number';
  return s.pendingCode ? 'pending' : 'not-sent';
}

const shortDate = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function loadClasses() {
  const { classes } = await api('/students/classes');
  const select = $('class');
  const chosen = select.value;
  select.replaceChildren(new Option('Choose a class...', ''));
  for (const c of classes) {
    const value = JSON.stringify([c.gradeLevel, c.strand, c.section]);
    select.add(new Option(`${c.classLabel} (${c.unverified} of ${c.students} not verified)`, value));
  }
  select.value = chosen;
}

async function loadStudents() {
  ({ students } = await api(`/verification/class?${new URLSearchParams(classFilter)}`));
  render();
}

$('class').addEventListener('change', async () => {
  showMessage(message, '', '');
  if (!$('class').value) {
    classFilter = null;
    $('list').hidden = true;
    $('send-box').hidden = true;
    $('summary').textContent = '';
    return;
  }
  const [gradeLevel, strand, section] = JSON.parse($('class').value);
  classFilter = { gradeLevel, strand, section };
  await loadStudents();
});

function render() {
  const count = (status) => students.filter((s) => statusOf(s) === status).length;
  const notSent = count('not-sent');
  const failed = students.filter((s) => s.pendingCode?.textStatus === 'failed').length;
  $('summary').textContent = `${count('verified')} of ${students.length} verified. `
    + `${count('pending') - failed} waiting for a code, ${failed} text failed, ${notSent} not sent yet, `
    + `${count('no-number')} without a number.`;
  $('send-box').hidden = !canSend;
  $('send-all').textContent = notSent ? `Send codes to ${plural(notSent, 'parent')}` : 'No codes to send';
  $('send-all').disabled = notSent === 0;
  $('list').hidden = false;

  const sorted = [...students].sort((a, b) => STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)]
    || a.fullName.localeCompare(b.fullName));
  $('rows').replaceChildren(...sorted.map(renderRow));
}

function renderRow(s) {
  const tr = document.createElement('tr');
  const status = statusOf(s);
  const cell = (content) => {
    const td = document.createElement('td');
    if (typeof content === 'string') td.textContent = content;
    else td.append(...content);
    tr.append(td);
  };
  const badge = (kind, text) => Object.assign(document.createElement('span'), { className: `badge ${kind}`, textContent: text });
  const button = (text, onClick) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text });
    b.addEventListener('click', onClick);
    return b;
  };

  cell(s.fullName);
  cell(s.guardianMobile ?? 'None');
  if (status === 'verified') cell([badge('ok', 'Verified')]);
  else if (status === 'no-number') cell([badge('error', 'No number')]);
  else if (status === 'not-sent') cell([badge('waiting', 'Not sent yet')]);
  else {
    // The code text's delivery status: a failed text usually means a wrong number.
    const { textStatus, textError, sentAt, expiresAt } = s.pendingCode;
    const note = (kind, text) => Object.assign(document.createElement('div'), { className: `note ${kind}`, textContent: text });
    if (textStatus === 'failed') {
      cell([badge('error', 'Text failed'), note('problem', `${textError || 'Not delivered'}. Check the number.`)]);
    } else if (textStatus === 'queued' || textStatus === 'sending') {
      cell([badge('waiting', 'Text waiting'), note('warning', 'Not sent yet. It goes out when the internet is back.')]);
    } else {
      cell([badge('new', 'Code sent'), note('', `Sent ${shortDate(sentAt)}, works until ${shortDate(expiresAt)}`)]);
    }
  }

  if (status === 'pending') {
    const input = Object.assign(document.createElement('input'), {
      inputMode: 'numeric', maxLength: 6, placeholder: '6-digit code', className: 'code-input',
    });
    input.dataset.studentId = s.id;
    const verify = () => confirmCode(s, input);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(); });
    const parts = [input, button('Verify', verify)];
    if (canSend) parts.push(button('Send new code', () => sendOne(s)));
    const wrap = Object.assign(document.createElement('div'), { className: 'code-cell' });
    wrap.append(...parts);
    cell([wrap]);
  } else if (status === 'not-sent' && canSend) {
    cell([button('Send code', () => sendOne(s))]);
  } else if (status === 'no-number') {
    cell('Add a number first');
  } else {
    cell('');
  }
  return tr;
}

async function confirmCode(student, input) {
  try {
    await api('/verification/confirm', { method: 'POST', body: { studentId: student.id, code: input.value } });
    student.mobileVerified = true;
    student.pendingCode = null;
    showMessage(message, 'ok', `${student.fullName}'s number is verified.`);
    render();
    loadClasses();
    document.querySelector('.code-input')?.focus(); // ready for the next code
  } catch (err) {
    showMessage(message, 'error', `${student.fullName}: ${err.message}`);
    input.select();
  }
}

async function sendOne(student) {
  try {
    const sent = await api('/verification/send', { method: 'POST', body: { studentId: student.id, forClass: true } });
    const testNote = sent.testMode ? ' (Test mode: the code is printed in the server window.)' : '';
    showMessage(message, 'ok', `Code sent to ${student.fullName}'s parent at ${sent.sentTo}.${testNote}`);
    await loadStudents();
  } catch (err) {
    showMessage(message, 'error', `${student.fullName}: ${err.message}`);
  }
}

$('send-all').addEventListener('click', async () => {
  const n = students.filter((s) => statusOf(s) === 'not-sent').length;
  if (!confirm(`Send verification codes to ${plural(n, 'parent')}? This uses ${plural(n, 'SMS credit')}.`)) return;
  $('send-all').disabled = true;
  try {
    const r = await api('/verification/send-class', { method: 'POST', body: classFilter });
    const skipped = [
      r.alreadyHaveCode && `${r.alreadyHaveCode} already ${r.alreadyHaveCode === 1 ? 'has' : 'have'} a code`,
      r.alreadyVerified && `${r.alreadyVerified} already verified`,
      r.noNumber && `${r.noNumber} ${r.noNumber === 1 ? 'has' : 'have'} no number`,
    ].filter(Boolean).join(', ');
    const testNote = r.testMode ? ' (Test mode: codes are printed in the server window.)' : '';
    showMessage(message, 'ok', `Sent ${plural(r.sent, 'code')}.${skipped ? ` Skipped: ${skipped}.` : ''}${testNote}`);
    await loadStudents();
    loadClasses();
  } catch (err) {
    showMessage(message, 'error', err.message);
    $('send-all').disabled = false;
  }
});

loadClasses().catch((err) => showMessage(message, 'error', err.message));
