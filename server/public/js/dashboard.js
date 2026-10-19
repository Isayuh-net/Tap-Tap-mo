// Dashboard: today's counts, internet and SMS status, failed texts, and every tap today. (Figure 5)
const $ = (id) => document.getElementById(id);
const REFRESH_MS = 15 * 1000;
const number = (n) => n.toLocaleString('en-US');

// Text status of a tap -> [badge class, label, note]
const TEXT_STATUS = {
  delivered: ['ok', 'Delivered', ''],
  sent: ['new', 'Sent', ''],
  queued: ['waiting', 'Queued', 'Retrying'],
  sending: ['waiting', 'Sending', ''],
  failed: ['error', 'Failed', ''],
  none: ['waiting', 'No text', 'Number not verified'],
};

function cell(tr, content) {
  const td = document.createElement('td');
  if (content instanceof Node) td.append(content);
  else td.textContent = content ?? '';
  tr.append(td);
  return td;
}

function badge(kind, text) {
  return Object.assign(document.createElement('span'), { className: `badge ${kind}`, textContent: text });
}

async function loadClasses() {
  const { classes } = await api('/students/classes');
  for (const c of classes) $('class').add(new Option(c.classLabel, JSON.stringify([c.gradeLevel, c.strand, c.section])));
}

function filters() {
  const params = new URLSearchParams();
  if ($('search').value.trim()) params.set('q', $('search').value.trim());
  if ($('class').value) {
    const [gradeLevel, strand, section] = JSON.parse($('class').value);
    params.set('gradeLevel', gradeLevel);
    params.set('strand', strand);
    params.set('section', section);
  }
  return params;
}

async function loadAttendance() {
  const data = await api(`/attendance/today?${filters()}`);
  const day = new Date(`${data.date}T00:00:00`);
  $('today').textContent = `${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} | Senior High School`;

  $('present').textContent = number(data.present);
  $('present-note').textContent = `of ${number(data.students)} students`;
  $('late').textContent = number(data.late);
  $('late-note').textContent = `arrived after ${data.lateAfter}`;
  $('absent').textContent = number(data.absent);

  const notices = [];
  if (!data.schoolDay) notices.push(data.holiday ? `Today is a holiday: ${data.holiday}.` : 'Today is a weekend, so absences are not counted.');
  if (data.unregisteredTaps) notices.push(`${data.unregisteredTaps} tap(s) today from unregistered cards.`);
  showMessage($('notice'), 'info', notices.join(' '));

  $('empty').hidden = data.taps.length > 0;
  $('rows').replaceChildren(...data.taps.map((t) => {
    const tr = document.createElement('tr');
    cell(tr, t.time);
    cell(tr, t.name);
    cell(tr, t.classLabel);
    cell(tr, t.type);
    cell(tr, t.isLate ? badge('late', 'Late') : 'No');
    cell(tr, t.parentMobile ?? 'None');
    const [kind, label, note] = TEXT_STATUS[t.textStatus] ?? ['waiting', t.textStatus, ''];
    const td = cell(tr, badge(kind, label));
    const detail = t.textStatus === 'failed' ? t.textError : note;
    if (detail) td.append(Object.assign(document.createElement('div'), { className: `note ${t.textStatus === 'failed' ? 'problem' : ''}`, textContent: detail }));
    return tr;
  }));
}

async function loadStats() {
  const stats = await api('/sms/stats');
  const { online } = stats.internet;
  $('internet').textContent = online === null ? 'Internet: checking...' : `Internet: ${online ? 'online' : 'offline'}`;
  $('internet').className = `chip ${online === false ? 'bad' : online ? 'good' : ''}`;
  $('credits').textContent = stats.credits === null
    ? `SMS credits: not available${stats.provider === 'mock' ? ' (test mode)' : ''}`
    : `SMS credits: ${number(stats.credits)}`;

  $('texts').textContent = number(stats.today.sent);
  $('texts-note').textContent = `${stats.today.queued} queued | ${stats.today.failed} failed`
    + (stats.waiting > stats.today.queued ? ` | ${stats.waiting} waiting in total` : '');
  return stats;
}

// Admin and staff see the failed texts that need fixing (the SMS log shows full numbers).
async function loadFailed(stats, user) {
  if (!['admin', 'staff'].includes(user.role) || stats.failedTotal === 0) {
    $('failed-box').hidden = true;
    return;
  }
  const { texts } = await api('/sms?status=failed');
  $('failed-box').hidden = false;
  $('failed-title').textContent = `${stats.failedTotal} text${stats.failedTotal === 1 ? '' : 's'} failed`;
  $('failed-rows').replaceChildren(...texts.slice(0, 5).map((m) => {
    const tr = document.createElement('tr');
    cell(tr, m.createdAt);
    cell(tr, m.name ?? '');
    cell(tr, m.kindLabel);
    cell(tr, m.toMobile);
    cell(tr, m.lastError ?? 'Not delivered');
    return tr;
  }));
}

async function loadBackup(user) {
  if (user.role !== 'admin') return;
  const { latest } = await api('/backups');
  $('backup').hidden = false;
  $('backup').textContent = latest ? `Last backup: ${latest.when}` : 'No backup yet';
  $('backup').className = `chip ${latest?.recent ? 'good' : 'bad'}`;
}

async function refresh() {
  try {
    const user = await currentUser;
    const [, stats] = await Promise.all([loadAttendance(), loadStats()]);
    await Promise.all([loadFailed(stats, user), loadBackup(user)]);
  } catch (err) {
    showMessage($('notice'), 'error', `Could not refresh: ${err.message}`);
  }
}

let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadAttendance, 300);
});
$('class').addEventListener('change', loadAttendance);

loadClasses();
refresh();
setInterval(refresh, REFRESH_MS);
