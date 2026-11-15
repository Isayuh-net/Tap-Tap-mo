// Dashboard: today's counts, internet and SMS status, failed texts, and every tap today. (Figure 5)
const $ = (id) => document.getElementById(id);
const REFRESH_MS = 15 * 1000;
const number = (n) => n.toLocaleString('en-US');
const plural = (n, word) => `${number(n)} ${word}${n === 1 ? '' : 's'}`;

// Text status of a tap -> [badge class, label, note]
const TEXT_STATUS = {
  delivered: ['ok', 'Delivered', ''],
  sent: ['new', 'Sent', ''],
  queued: ['waiting', 'Queued', 'Retrying'],
  sending: ['waiting', 'Sending', ''],
  failed: ['error', 'Failed', ''],
  none: ['waiting', 'No text', 'Number not verified'],
  'not-needed': ['waiting', 'No text', 'Lunch taps are not texted'],
};

function cell(tr, content, className) {
  const td = document.createElement('td');
  if (content instanceof Node) td.append(content);
  else td.textContent = content ?? '';
  if (className) td.className = className;
  tr.append(td);
  return td;
}

function badge(kind, text) {
  return Object.assign(document.createElement('span'), { className: `badge ${kind}`, textContent: text });
}

let classList = [];

async function loadClasses() {
  ({ classes: classList } = await api('/students/classes'));
  for (const c of classList) $('class').add(new Option(c.classLabel, JSON.stringify([c.gradeLevel, c.strand, c.section])));
  showEnrollment();
}

// "182 enrolled: 86 male, 94 female" for the class filter's choice.
function showEnrollment() {
  const chosen = $('class').value
    ? classList.filter((c) => JSON.stringify([c.gradeLevel, c.strand, c.section]) === $('class').value)
    : classList;
  const sum = (key) => chosen.reduce((total, c) => total + c[key], 0);
  const notSet = sum('sexNotSet') ? `, ${number(sum('sexNotSet'))} not set` : '';
  const where = $('class').value ? '' : ` in ${plural(chosen.length, 'section')}`;
  $('enrollment').textContent = `${number(sum('students'))} enrolled${where}: ${number(sum('male'))} male, ${number(sum('female'))} female${notSet}`;
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
  $('today').textContent = `${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, Senior High School`;

  $('on-time').textContent = number(data.present - data.late);
  $('on-time-note').textContent = `of ${plural(data.students, 'student')}`;
  $('late').textContent = number(data.late);
  $('late-note').textContent = `tapped in after ${data.lateAfter}`;
  $('absent').textContent = data.schoolDay ? number(data.absent) : '-';
  $('late-lunch').textContent = number(data.lateFromLunch);
  $('late-lunch-note').textContent = `back after ${data.lunchEnd}, parents texted`;
  $('footnote').textContent = `Lunch taps from ${data.lunchStart} don't text parents. A tap back in after ${data.lunchEnd} texts the parent. `
    + `Leaving before ${data.dismissal} is an early out, also texted.`;

  const notices = [];
  if (!data.schoolDay) notices.push(data.holiday ? `Today is a holiday: ${data.holiday}. Nobody is marked absent.` : 'No classes today (weekend), so nobody is marked absent.');
  if (data.leftEarly) notices.push(`${plural(data.leftEarly, 'student')} left early today.`);
  if (data.unregisteredTaps) notices.push(`${plural(data.unregisteredTaps, 'tap')} today from cards that aren't registered.`);
  showMessage($('notice'), 'info', notices.join(' '));

  $('empty').hidden = data.taps.length > 0;
  $('rows').replaceChildren(...data.taps.map((t) => {
    const tr = document.createElement('tr');
    cell(tr, t.time);
    cell(tr, t.name, 'strong');
    cell(tr, t.classLabel);
    const type = cell(tr, t.type);
    if (t.isLate) type.append(' ', badge('late', 'Late'));
    if (t.type === 'Early out') type.append(' ', badge('late', 'Early'));
    if (t.method === 'lrn') type.append(' ', badge('waiting', 'LRN')); // typed, no card
    cell(tr, t.parentMobile ?? 'None', 'mono');
    const [kind, label, note] = TEXT_STATUS[t.textStatus] ?? ['waiting', t.textStatus, ''];
    const td = cell(tr, badge(kind, label));
    const detail = t.textStatus === 'failed' ? t.textError : note;
    if (detail) td.append(Object.assign(document.createElement('div'), { className: `note ${t.textStatus === 'failed' ? 'problem' : ''}`, textContent: detail }));
    return tr;
  }));
}

const PROVIDER_NAMES = { mock: 'Test mode', semaphore: 'Semaphore', castph: 'Cast PH' };

async function loadStats() {
  const stats = await api('/sms/stats');
  const { online } = stats.internet;
  $('internet').textContent = online === null ? 'Internet: checking' : `Internet ${online ? 'online' : 'offline'}`;
  $('internet').className = `status-pill ${online === false ? 'bad' : online ? 'live' : 'neutral'}`;

  const parts = [PROVIDER_NAMES[stats.provider] ?? stats.provider];
  if (stats.credits !== null) parts.push(`${number(stats.credits)} credits`);
  parts.push(`${plural(stats.today.sent, 'text')} sent today`);
  if (stats.today.queued) parts.push(`${number(stats.today.queued)} waiting`);
  $('sms-status').textContent = parts.join(' · ');
  $('sms-status').className = `status-pill ${stats.provider === 'mock' ? '' : 'live'}`;
  $('sms-status').title = stats.provider === 'mock' ? 'Test mode: texts are printed in the server window, not sent' : '';
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
  $('failed-title').textContent = `${plural(stats.failedTotal, 'text')} failed`;
  $('failed-rows').replaceChildren(...texts.slice(0, 5).map((m) => {
    const tr = document.createElement('tr');
    cell(tr, m.createdAt);
    cell(tr, m.name ?? '', 'strong');
    cell(tr, m.kindLabel);
    cell(tr, m.toMobile, 'mono');
    cell(tr, m.lastError ?? 'Not delivered');
    return tr;
  }));
}

async function loadBackup(user) {
  if (user.role !== 'admin') return;
  const { latest } = await api('/backups');
  $('backup').hidden = false;
  $('backup').textContent = latest ? `Last backup ${latest.when}` : 'No backup yet';
  $('backup').className = `status-pill ${latest?.recent ? 'live' : 'bad'}`;
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
$('class').addEventListener('change', showEnrollment);

loadClasses();
refresh();
setInterval(refresh, REFRESH_MS);
