// Reports page: daily and monthly attendance, CSV download, printing, and the holiday list.
const $ = (id) => document.getElementById(id);
const message = $('message');
let mode = 'daily';
let isAdmin = false;

// Today in the school's time zone, as YYYY-MM-DD
const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
$('date').value = todayDate;
$('month').value = todayDate.slice(0, 7);

const STATUS_BADGES = { Present: 'ok', Late: 'late', Absent: 'error', 'No classes': 'waiting' };

const prettyDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const prettyMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

async function loadClasses() {
  const { classes } = await api('/students/classes');
  for (const c of classes) $('class').add(new Option(c.classLabel, JSON.stringify([c.gradeLevel, c.strand, c.section])));
}

function query(extra = {}) {
  const params = new URLSearchParams(extra);
  if (mode === 'daily') params.set('date', $('date').value);
  else params.set('month', $('month').value);
  if ($('class').value) {
    const [gradeLevel, strand, section] = JSON.parse($('class').value);
    params.set('gradeLevel', gradeLevel);
    params.set('strand', strand);
    params.set('section', section);
  }
  return params;
}

function setTable(headers, rows) {
  const tr = document.createElement('tr');
  for (const h of headers) tr.append(Object.assign(document.createElement('th'), { textContent: h }));
  $('head').replaceChildren(tr);
  $('rows').replaceChildren(...rows.map((cells) => {
    const row = document.createElement('tr');
    for (const c of cells) {
      const td = document.createElement('td');
      if (c instanceof Node) td.append(c);
      else td.textContent = c ?? '';
      row.append(td);
    }
    return row;
  }));
}

const badge = (status) => Object.assign(document.createElement('span'), { className: `badge ${STATUS_BADGES[status] ?? 'waiting'}`, textContent: status });

async function load() {
  showMessage(message, '', '');
  const classText = $('class').value ? $('class').selectedOptions[0].text : 'All classes';
  $('download').href = `/api/reports/${mode}?${query({ format: 'csv' })}`;
  try {
    const report = await api(`/reports/${mode}?${query()}`);
    if (mode === 'daily') {
      $('title').textContent = `Daily attendance: ${prettyDate(report.date)} (${classText})`;
      const s = report.summary;
      const extra = [s.lateFromLunch && `${s.lateFromLunch} late from lunch`, s.leftEarly && `${s.leftEarly} left early`].filter(Boolean);
      $('summary').textContent = report.schoolDay
        ? `${s.students} students: ${s.present} present (${s.late} late), ${s.absent} absent.${extra.length ? ` ${extra.join(', ')}.` : ''}`
        : `No classes on this day${report.holiday ? ` (${report.holiday})` : ' (weekend)'}. Taps are still listed.`;
      setTable(['Student', 'Class', 'Time in', 'Time out', 'Status', 'Notes'],
        report.rows.map((r) => [r.name, r.classLabel, r.timeIn, r.timeOut, badge(r.status), r.notes]));
    } else {
      $('title').textContent = `Monthly attendance: ${prettyMonth(report.month)} (${classText})`;
      const holidayText = report.holidays.length ? ` Holidays: ${report.holidays.map((h) => `${h.date.slice(8)} ${h.name}`).join(', ')}.` : '';
      $('summary').textContent = `${report.schoolDays} school days so far.${holidayText} Days before a student was added aren't counted.`;
      setTable(['Student', 'Class', 'School days', 'Present', 'Late', 'Absent', 'Late from lunch', 'Left early', 'Attendance'],
        report.rows.map((r) => [r.name, r.classLabel, r.schoolDays, r.present, r.late, r.absent, r.lateFromLunch, r.leftEarly,
          r.percent === null ? '' : `${r.percent}%`]));
    }
    if (!report.rows.length) $('summary').textContent += ' No students match.';
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
}

function switchTo(newMode) {
  mode = newMode;
  $('tab-daily').classList.toggle('active', mode === 'daily');
  $('tab-monthly').classList.toggle('active', mode === 'monthly');
  $('date-label').hidden = mode !== 'daily';
  $('month-label').hidden = mode !== 'monthly';
  load();
}

async function loadHolidays() {
  const years = new Set([$('date').value.slice(0, 4), $('month').value.slice(0, 4)]);
  const lists = await Promise.all([...years].map((y) => api(`/holidays?year=${y}`)));
  const holidays = lists.flatMap((l) => l.holidays).sort((a, b) => a.date.localeCompare(b.date));
  $('holidays').replaceChildren(...holidays.map((h) => {
    const li = document.createElement('li');
    li.textContent = `${prettyDate(h.date)}: ${h.name} `;
    if (isAdmin) {
      const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Remove' });
      remove.addEventListener('click', async () => {
        await api(`/holidays/${h.date}`, { method: 'DELETE' });
        loadHolidays();
        load();
      });
      li.append(remove);
    }
    return li;
  }));
  if (!holidays.length) $('holidays').replaceChildren(Object.assign(document.createElement('li'), { textContent: 'None added yet.' }));
}

$('holiday-add').addEventListener('click', async () => {
  try {
    await api('/holidays', { method: 'POST', body: { date: $('holiday-date').value, name: $('holiday-name').value } });
    $('holiday-name').value = '';
    showMessage(message, 'ok', 'Holiday saved.');
    loadHolidays();
    load();
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
});

$('tab-daily').addEventListener('click', () => switchTo('daily'));
$('tab-monthly').addEventListener('click', () => switchTo('monthly'));
$('date').addEventListener('change', load);
$('month').addEventListener('change', load);
$('class').addEventListener('change', load);
$('print').addEventListener('click', () => window.print());

currentUser.then((user) => {
  isAdmin = user.role === 'admin';
  $('holiday-form').hidden = !isAdmin;
  loadHolidays();
});
loadClasses();
load();
