// Reports and files: attendance as Excel (daily or monthly, one section or all, boys and girls on
// separate sheets or together), the attendance on screen, the school's templates, the folder where
// downloads are saved, and the holiday list.
const $ = (id) => document.getElementById(id);
const message = $('message');
let period = 'monthly';
let classes = [];
let canEditFiles = false;
let isAdmin = false;
let lastSaved = null; // path of the file just downloaded, opened in the folder list

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const FOLDER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>';
const folderIcon = () => Object.assign(document.createElement('span'), { innerHTML: FOLDER_ICON }).firstChild;

// Today in the school's time zone, as YYYY-MM-DD
const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
$('date').value = todayDate;
$('month').value = todayDate.slice(0, 7);

const STATUS_BADGES = { Present: 'ok', Late: 'late', Absent: 'error', 'No classes': 'waiting' };
const prettyDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const longDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const prettyMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

async function loadClasses() {
  ({ classes } = await api('/students/classes'));
  for (const c of classes) $('class').add(new Option(c.classLabel, JSON.stringify([c.gradeLevel, c.strand, c.section])));
  showFileName();
}

const chosenClass = () => ($('class').value ? classes.find((c) => JSON.stringify([c.gradeLevel, c.strand, c.section]) === $('class').value) : null);

function query(extra = {}) {
  const params = new URLSearchParams(extra);
  if (period === 'daily') params.set('date', $('date').value);
  else params.set('month', $('month').value);
  if ($('class').value) {
    const [gradeLevel, strand, section] = JSON.parse($('class').value);
    params.set('gradeLevel', gradeLevel);
    params.set('strand', strand);
    params.set('section', section);
  }
  return params;
}

// The name and contents of the file the button downloads (the server names it the same way).
function showFileName() {
  const cls = chosenClass();
  const label = cls ? cls.classLabel : 'All sections';
  const separate = $('separate').checked;
  const when = period === 'daily' ? `Daily, ${longDate($('date').value)}` : prettyMonth($('month').value);
  $('file-name').textContent = `${label}, ${when}${separate ? '' : ' (male and female)'}.xlsx`;
  const layout = period === 'monthly' ? 'SF2 layout, a column for each school day' : 'time in, time out and status for each student';
  let sheets;
  if (separate) {
    const notSet = (cls ? cls.sexNotSet : classes.reduce((n, c) => n + c.sexNotSet, 0)) > 0;
    sheets = cls
      ? `Two sheets: Male and Female${notSet ? ' (and Not specified)' : ''}`
      : `A Male and a Female sheet for each of the ${classes.length} sections`;
  } else {
    sheets = cls ? 'One sheet, boys then girls' : `One sheet for each of the ${classes.length} sections, boys then girls`;
  }
  $('file-desc').textContent = `${sheets}. ${layout.charAt(0).toUpperCase()}${layout.slice(1)}.`;
  $('download-csv').href = `/api/reports/${period}?${query({ format: 'csv' })}`;
}

$('download').addEventListener('click', async () => {
  $('download').disabled = true;
  showMessage(message, 'info', 'Making the Excel file...');
  const params = query({ period });
  if ($('separate').checked) params.set('separate', '1');
  try {
    const { fileName, savedTo } = await downloadFile(`/reports/excel?${params}`);
    lastSaved = savedTo;
    showMessage(message, 'ok', savedTo
      ? `Downloaded ${fileName}. A copy is saved in the folder below.`
      : `Downloaded ${fileName}. The copy for the folder below could not be saved; check the folder.`);
    loadFiles();
  } catch (err) {
    showMessage(message, 'error', err.message);
  } finally {
    $('download').disabled = false;
  }
});

// ---- Attendance on screen ----
function setTable(headers, rows) {
  $('head').replaceChildren(el('tr', {}, ...headers.map((h) => el('th', { textContent: h }))));
  $('rows').replaceChildren(...rows.map((cells) => el('tr', {}, ...cells.map((c) => {
    const td = document.createElement('td');
    if (c instanceof Node) td.append(c);
    else td.textContent = c ?? '';
    return td;
  }))));
}

const badge = (status) => el('span', { className: `badge ${STATUS_BADGES[status] ?? 'waiting'}`, textContent: status });

async function loadPreview() {
  if (!$('preview').open) return;
  const classText = chosenClass()?.classLabel ?? 'All sections';
  try {
    const report = await api(`/reports/${period}?${query()}`);
    if (period === 'daily') {
      $('title').textContent = `Daily attendance: ${prettyDate(report.date)} (${classText})`;
      const s = report.summary;
      const extra = [s.lateFromLunch && `${s.lateFromLunch} late from lunch`, s.leftEarly && `${s.leftEarly} left early`].filter(Boolean);
      $('summary').textContent = report.schoolDay
        ? `${s.students} students: ${s.present} present (${s.late} late), ${s.absent} absent.${extra.length ? ` ${extra.join(', ')}.` : ''}`
        : `No classes on this day${report.holiday ? ` (${report.holiday})` : ' (weekend)'}. Taps are still listed.`;
      setTable(['Student', 'Sex', 'Section', 'Time in', 'Time out', 'Status', 'Notes'],
        report.rows.map((r) => [r.name, r.sex ?? '', r.classLabel, r.timeIn, r.timeOut, badge(r.status), r.notes]));
    } else {
      $('title').textContent = `Monthly attendance: ${prettyMonth(report.month)} (${classText})`;
      const holidayText = report.holidays.length ? ` Holidays: ${report.holidays.map((h) => `${h.date.slice(8)} ${h.name}`).join(', ')}.` : '';
      $('summary').textContent = `${report.schoolDays} school days so far.${holidayText} Days before a student was added aren't counted.`;
      setTable(['Student', 'Sex', 'Section', 'School days', 'Present', 'Late', 'Absent', 'Late from lunch', 'Left early', 'Attendance'],
        report.rows.map((r) => [r.name, r.sex ?? '', r.classLabel, r.schoolDays, r.present, r.late, r.absent, r.lateFromLunch, r.leftEarly,
          r.percent === null ? '' : `${r.percent}%`]));
    }
    if (!report.rows.length) $('summary').textContent += ' No students match.';
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
}

function changed() {
  showFileName();
  loadPreview();
}

for (const button of $('period').querySelectorAll('button')) {
  button.addEventListener('click', () => {
    period = button.dataset.period;
    for (const b of $('period').querySelectorAll('button')) b.classList.toggle('active', b === button);
    $('date-label').hidden = period !== 'daily';
    $('month-label').hidden = period !== 'monthly';
    changed();
  });
}
for (const id of ['date', 'month', 'class', 'separate']) $(id).addEventListener('change', changed);
$('preview').addEventListener('toggle', loadPreview);
$('print').addEventListener('click', () => window.print());

// ---- School templates ----
let templateFor = null;

async function loadTemplates() {
  const { templates } = await api('/templates');
  $('templates').replaceChildren(...templates.map((t) => {
    let detail = 'Not uploaded yet';
    if (t.builtIn) detail = `Built-in template (${t.fileName}). Upload the school's own to replace it.`;
    else if (t.fileName) detail = `${t.fileName}, uploaded ${shortDate(t.uploadedAt)}`;
    const actions = el('div', { className: 'actions' });
    if (t.fileName) actions.append(el('a', { className: 'button', href: `/api/templates/${t.kind}`, textContent: 'Download' }));
    if (canEditFiles) {
      const replace = el('button', { type: 'button', className: 'link-button', textContent: t.fileName && !t.builtIn ? 'Replace' : 'Upload' });
      replace.addEventListener('click', () => {
        templateFor = t;
        $('template-file').value = '';
        $('template-file').click();
      });
      actions.append(replace);
    }
    return el('div', { className: 'template-row' }, el('div', {}, el('strong', { textContent: t.label }), el('span', { textContent: detail })), actions);
  }));
}

$('template-file').addEventListener('change', async () => {
  const file = $('template-file').files[0];
  if (!file || !templateFor) return;
  try {
    await api(`/templates/${templateFor.kind}`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
    });
    showMessage(message, 'ok', `${templateFor.label} replaced with ${file.name}.`);
    loadTemplates();
  } catch (err) {
    showMessage(message, 'error', `${templateFor.label} was not replaced: ${err.message}`);
  }
});

// ---- Folder of saved files ----
async function loadFiles() {
  const { folder, years } = await api('/reports/files');
  $('folder').textContent = folder;
  $('folder-input').value = folder;
  $('tree-empty').hidden = years.length > 0;
  $('tree').hidden = years.length === 0;
  $('tree').replaceChildren(...years.flatMap((year, y) => [
    el('div', { className: 'tree-year' }, folderIcon(), year.name),
    ...year.sections.map((section) => {
      const details = el('details', { className: 'tree-section' },
        el('summary', {}, folderIcon(), section.name, el('span', { className: 'count', textContent: `${section.files.length} file${section.files.length === 1 ? '' : 's'}` })),
        el('div', { className: 'tree-files' }, ...section.files.map((f) => el('div', { className: 'tree-file' },
          el('span', { className: 'name', textContent: f.name }),
          el('span', { className: 'date', textContent: shortDate(f.modified) }),
          el('a', { href: `/api/reports/files/open?path=${encodeURIComponent(f.path)}`, textContent: 'Open' })))));
      details.open = lastSaved ? section.files.some((f) => f.path === lastSaved) : y === 0 && section.name === (chosenClass()?.classLabel);
      return details;
    }),
  ]));
}

$('change-folder').addEventListener('click', () => {
  $('folder-form').hidden = false;
  $('folder-input').focus();
});
$('folder-cancel').addEventListener('click', () => { $('folder-form').hidden = true; });
$('folder-save').addEventListener('click', async () => {
  try {
    await api('/reports/folder', { method: 'PUT', body: { folder: $('folder-input').value } });
    $('folder-form').hidden = true;
    showMessage(message, 'ok', 'Folder changed. New downloads are saved there.');
    loadFiles();
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
});

// ---- Holidays ----
async function loadHolidays() {
  const years = new Set([$('date').value.slice(0, 4), $('month').value.slice(0, 4), todayDate.slice(0, 4)]);
  const lists = await Promise.all([...years].map((y) => api(`/holidays?year=${y}`)));
  const holidays = lists.flatMap((l) => l.holidays).sort((a, b) => a.date.localeCompare(b.date));
  $('holidays').replaceChildren(...holidays.map((h) => {
    const li = el('li', { textContent: `${prettyDate(h.date)}: ${h.name}` });
    if (isAdmin) {
      const remove = el('button', { type: 'button', className: 'link-button', textContent: 'Remove' });
      remove.addEventListener('click', async () => {
        await api(`/holidays/${h.date}`, { method: 'DELETE' });
        loadHolidays();
        loadPreview();
      });
      li.append(remove);
    }
    return li;
  }));
  if (!holidays.length) $('holidays').replaceChildren(el('li', { textContent: 'None added yet.' }));
}

$('holiday-add').addEventListener('click', async () => {
  try {
    await api('/holidays', { method: 'POST', body: { date: $('holiday-date').value, name: $('holiday-name').value } });
    $('holiday-name').value = '';
    showMessage(message, 'ok', 'Holiday saved.');
    loadHolidays();
    loadPreview();
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
});

currentUser.then((user) => {
  isAdmin = user.role === 'admin';
  canEditFiles = ['admin', 'staff'].includes(user.role);
  $('holiday-form').hidden = !isAdmin;
  $('change-folder').hidden = !isAdmin;
  loadHolidays();
  loadTemplates();
});
loadClasses().then(loadFiles).catch((err) => showMessage(message, 'error', err.message));
showFileName();
