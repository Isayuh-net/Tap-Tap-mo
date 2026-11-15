// Students page: one section at a time (tabs), its male and female counts, how many students it
// should have, and its students split into Male and Female, with photos for the gate screen.
// The search box searches every section.
const $ = (id) => document.getElementById(id);
const number = (n) => n.toLocaleString('en-US');
const plural = (n, word) => `${number(n)} ${word}${n === 1 ? '' : 's'}`;
const SHOW_FIRST = 10; // rows shown per group before "Show all"
const GROUPS = [['M', 'Male'], ['F', 'Female'], [null, 'Sex not set']];

let classes = [];
let chosen = null;     // the section shown: one of `classes`
let sexShown = 'all';  // 'all', 'M' or 'F'
let students = [];     // the section's students (or search results)
let expanded = new Set(); // groups showing every row
let canEdit = false;   // admin and staff

const keyOf = (c) => `${c.gradeLevel}|${c.strand}|${c.section}`;
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

async function loadClasses() {
  ({ classes } = await api('/students/classes'));
  const sum = (key) => classes.reduce((total, c) => total + c[key], 0);
  const notSet = sum('sexNotSet') ? `, ${number(sum('sexNotSet'))} not set` : '';
  $('overview').textContent = `${plural(sum('students'), 'student')} in ${plural(classes.length, 'section')}: `
    + `${number(sum('male'))} male, ${number(sum('female'))} female${notSet}`;
  const wanted = chosen ? keyOf(chosen) : decodeURIComponent(location.hash.slice(1));
  chosen = classes.find((c) => keyOf(c) === wanted) ?? classes[0] ?? null;
  $('sections').replaceChildren(...classes.map((c) => {
    const button = el('button', { type: 'button', textContent: c.classLabel });
    button.classList.toggle('active', c === chosen && !searching());
    button.setAttribute('aria-pressed', String(c === chosen && !searching()));
    button.addEventListener('click', () => {
      chosen = c;
      $('search').value = '';
      expanded = new Set();
      history.replaceState(null, '', `#${encodeURIComponent(keyOf(c))}`);
      loadClasses().then(loadStudents);
    });
    return button;
  }));
  showSection();
}

const searching = () => $('search').value.trim() !== '';

// The section's title, counts, and how many students it should have.
function showSection() {
  $('size-box').hidden = searching() || !chosen;
  $('excel-box').hidden = searching() || !chosen || !canEdit;
  if (searching()) {
    $('section-title').textContent = 'Search results';
    return;
  }
  if (!chosen) {
    $('section-title').textContent = 'No students yet';
    $('section-counts').textContent = 'Import the enrollment list or register students to see them here.';
    return;
  }
  const c = chosen;
  $('section-title').textContent = c.classLabel;
  const extras = [
    c.sexNotSet && `${number(c.sexNotSet)} sex not set`,
    c.withoutCard && `${number(c.withoutCard)} without a card`,
    c.unverified && `${plural(c.unverified, 'parent number')} not verified`,
  ].filter(Boolean);
  $('section-counts').textContent = `${number(c.male)} male, ${number(c.female)} female, ${number(c.students)} registered`
    + (extras.length ? ` · ${extras.join(' · ')}` : '');
  if (document.activeElement !== $('expected')) $('expected').value = c.expected ?? '';
  showSizeStatus();
}

function showSizeStatus() {
  const registered = chosen.students;
  const expected = chosen.expected;
  let text = 'Enter how many students this section has, to see if anyone is still missing.';
  if (expected && registered < expected) text = `${number(registered)} registered. Add ${number(expected - registered)} more to reach ${number(expected)}.`;
  else if (expected && registered === expected) text = `All ${number(expected)} registered.`;
  else if (expected) text = `${number(registered)} registered, ${number(registered - expected)} more than ${number(expected)}. Check for students listed twice, or change the number.`;
  $('size-status').textContent = text;
}

async function loadStudents() {
  const params = new URLSearchParams();
  if (searching()) params.set('q', $('search').value.trim());
  else if (chosen) {
    params.set('gradeLevel', chosen.gradeLevel);
    params.set('strand', chosen.strand);
    params.set('section', chosen.section);
  } else {
    students = [];
    return showStudents();
  }
  ({ students } = await api(`/students?${params}`));
  if (searching()) $('section-counts').textContent = `${plural(students.length, 'student')} found in every section.`;
  showStudents();
}

// One table per sex, each showing the first rows and a "Show all" link.
function showStudents() {
  const groups = GROUPS
    .filter(([sex]) => sexShown === 'all' || sex === sexShown)
    .map(([sex, title]) => ({ sex, title, rows: students.filter((s) => (s.sex ?? null) === sex) }))
    .filter((g) => g.rows.length || (g.sex !== null && !searching()));
  $('groups').replaceChildren(...groups.flatMap((g) => {
    const key = String(g.sex);
    const shown = expanded.has(key) ? g.rows : g.rows.slice(0, SHOW_FIRST);
    const parts = [el('h4', { className: 'group-title' }, g.title, ' ', el('span', { textContent: `(${g.rows.length})` }))];
    if (!g.rows.length) {
      parts.push(el('p', { className: 'hint', textContent: `No ${g.title.toLowerCase()} students in this section.` }));
      return parts;
    }
    // Fixed column widths, so the Male and Female tables line up
    const columns = [['Name', '25%'], ['LRN', '15%'], ['ID number', '11%'], ['RFID card number', '15%'], ['Parent mobile', '16%'], ['', '18%']];
    const table = el('table', { className: 'student-table' },
      el('thead', {}, el('tr', {}, ...columns.map(([h, width]) => Object.assign(el('th', { textContent: h }), { style: `width: ${width}` })))),
      el('tbody', {}, ...shown.map(studentRow)));
    parts.push(el('div', { className: 'table-wrap' }, table));
    if (g.rows.length > SHOW_FIRST) {
      const toggle = el('button', { type: 'button', className: 'link-button', textContent: expanded.has(key) ? 'Show fewer' : 'Show all' });
      toggle.addEventListener('click', () => {
        if (expanded.has(key)) expanded.delete(key);
        else expanded.add(key);
        showStudents();
      });
      parts.push(el('p', { className: 'table-foot' }, `Showing ${shown.length} of ${g.rows.length}. `, toggle));
    }
    return parts;
  }));
}

function avatar(student) {
  if (student.photoVersion) {
    return el('img', { className: 'avatar', src: `/api/students/${student.id}/photo?v=${student.photoVersion}`, alt: '' });
  }
  const initials = student.fullName.split(/\s+/).filter((w) => /^[A-Za-zÑñ]/.test(w)).map((w) => w[0]).slice(0, 2).join('');
  return el('span', { className: 'avatar empty', textContent: initials, ariaHidden: 'true' });
}

function studentRow(s) {
  const name = el('div', { className: 'name-cell' }, avatar(s),
    el('div', {}, s.fullName, searching() ? el('span', { className: 'subtle', textContent: s.classLabel }) : ''));
  const card = s.cardUid
    ? el('div', {}, el('span', { className: 'mono', textContent: s.cardUid }), el('span', { className: 'subtle', textContent: `Card no. ${s.cardNo}` }))
    : el('span', { className: 'subtle', textContent: 'No card yet' });
  const mobile = el('div', {}, el('span', { className: 'mono', textContent: s.guardianMobile ?? 'None' }));
  if (s.guardianMobile && !s.mobileVerified) mobile.append(' ', el('span', { className: 'badge waiting', textContent: 'Not verified' }));

  const actions = el('td', { className: 'actions-cell' });
  if (canEdit) {
    actions.append(s.cardUid
      ? el('a', { href: `register.html?uid=${encodeURIComponent(s.cardUid)}`, textContent: 'Edit' })
      : el('a', { href: 'assign-cards.html', textContent: 'Assign a card' }));
    const photo = el('button', { type: 'button', className: 'small-button', textContent: s.photoVersion ? 'Change photo' : 'Add photo' });
    photo.addEventListener('click', () => {
      photoFor = s;
      $('photo-file').value = '';
      $('photo-file').click();
    });
    actions.append(photo);
    if (s.photoVersion) {
      const remove = el('button', { type: 'button', className: 'link-button', textContent: 'Remove photo' });
      remove.addEventListener('click', () => removePhoto(s));
      actions.append(remove);
    }
  }
  return el('tr', {},
    el('td', {}, name),
    el('td', { className: 'mono', textContent: s.lrn ?? '' }),
    el('td', { className: 'mono', textContent: s.schoolId ?? '' }),
    el('td', {}, card),
    el('td', {}, mobile),
    actions);
}

// Phone photos are several MB, so they are shrunk here before uploading:
// at most 600 x 800 pixels, saved as JPEG (about 50 KB). The gate shows them much smaller.
async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That file could not be opened as a photo. Use a JPG or PNG.');
  });
  const scale = Math.min(1, 600 / bitmap.width, 800 / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

let photoFor = null; // the student whose photo button was clicked

$('photo-file').addEventListener('change', async () => {
  const file = $('photo-file').files[0];
  const student = photoFor;
  if (!file || !student) return;
  showMessage($('message'), 'info', `Uploading ${student.fullName}'s photo...`);
  try {
    await api(`/students/${student.id}/photo`, { method: 'PUT', body: await shrinkPhoto(file) });
    showMessage($('message'), 'ok', `Photo saved for ${student.fullName}. Gates show it within a few minutes.`);
    await loadStudents();
  } catch (err) {
    showMessage($('message'), 'error', `${student.fullName}'s photo was not saved: ${err.message}`);
  }
});

async function removePhoto(student) {
  if (!confirm(`Remove ${student.fullName}'s photo?`)) return;
  try {
    await api(`/students/${student.id}/photo`, { method: 'DELETE' });
    showMessage($('message'), 'ok', `Photo removed for ${student.fullName}.`);
    await loadStudents();
  } catch (err) {
    showMessage($('message'), 'error', err.message);
  }
}

// Saves the section's size (if it changed) and loads the list again from the server.
$('repopulate').addEventListener('click', async () => {
  if (!chosen) return;
  const value = $('expected').value.trim();
  try {
    if (canEdit && value !== String(chosen.expected ?? '')) {
      await api('/students/section-size', {
        method: 'PUT',
        body: { gradeLevel: chosen.gradeLevel, strand: chosen.strand, section: chosen.section, expected: value || null },
      });
    }
    await loadClasses();
    await loadStudents();
    showMessage($('message'), '', '');
  } catch (err) {
    showMessage($('message'), 'error', err.message);
  }
});
$('expected').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('repopulate').click();
});

$('download-excel').addEventListener('click', async () => {
  const params = new URLSearchParams({ gradeLevel: chosen.gradeLevel, strand: chosen.strand, section: chosen.section });
  try {
    const { fileName } = await downloadFile(`/students/export?${params}`);
    showMessage($('message'), 'ok', `Downloaded ${fileName}.`);
  } catch (err) {
    showMessage($('message'), 'error', err.message);
  }
});

for (const button of $('sex-filter').querySelectorAll('button')) {
  button.addEventListener('click', () => {
    sexShown = button.dataset.sex;
    for (const b of $('sex-filter').querySelectorAll('button')) b.classList.toggle('active', b === button);
    showStudents();
  });
}

let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    expanded = new Set();
    for (const b of $('sections').querySelectorAll('button')) b.classList.toggle('active', !searching() && b.textContent === chosen?.classLabel);
    showSection();
    loadStudents().catch((err) => showMessage($('message'), 'error', err.message));
  }, 300);
});

currentUser.then((user) => {
  canEdit = ['admin', 'staff'].includes(user.role);
  $('import-link').hidden = !canEdit;
  $('expected').disabled = !canEdit;
  showSection();
  showStudents();
});
loadClasses().then(loadStudents).catch((err) => showMessage($('message'), 'error', err.message));
