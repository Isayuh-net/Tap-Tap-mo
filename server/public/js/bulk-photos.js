// Students page: upload many photos at once (admin and staff). Each file is named after the student's
// LRN or ID number ("136502141517.jpg", "2026-0041 Juan.jpg"). The files are matched to students here
// and listed for checking, then shrunk and uploaded one at a time, like a single photo.
// Uses $, el, shrinkPhoto, loadClasses and loadStudents from students.js.
const PHOTO_FILE = /\.(jpe?g|png|webp)$/i;
let bulkItems = []; // { file, student, state: 'ready' | 'skip' | 'done' | 'failed', note, cell }

// "2026-0041 Juan Dela Cruz.jpg" -> "2026-0041": the name up to the first space, underscore or dot
const fileKey = (name) => (/^[A-Za-z0-9-]+/.exec(name)?.[0] ?? '').toLowerCase();

// Every chosen file with the student it belongs to, or why it is skipped.
async function matchFiles(files) {
  const { students: everyone } = await api('/students');
  const byKey = new Map();
  for (const s of everyone) {
    if (s.lrn) byKey.set(s.lrn.toLowerCase(), s);
    if (s.schoolId) byKey.set(s.schoolId.toLowerCase(), s);
  }
  const used = new Map(); // student id -> the file already matched to them
  return [...files]
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .map((file) => {
      if (!PHOTO_FILE.test(file.name)) return { file, state: 'skip', note: 'Not a JPG, PNG or WebP photo' };
      const key = fileKey(file.name);
      const student = byKey.get(key);
      if (!student) return { file, state: 'skip', note: `No student has the LRN or ID number "${key || file.name}"` };
      if (used.has(student.id)) return { file, student, state: 'skip', note: `Same student as ${used.get(student.id)}` };
      used.set(student.id, file.name);
      return { file, student, state: 'ready', note: student.photoVersion ? 'Will replace their current photo' : 'Will be added' };
    });
}

const BADGES = { ready: 'new', skip: 'error', done: 'ok', failed: 'error' };

function statusBadge(item) {
  return el('span', { className: `badge ${BADGES[item.state]}`, textContent: item.note });
}

function showBulk() {
  const count = (state) => bulkItems.filter((i) => i.state === state).length;
  const replacing = bulkItems.filter((i) => i.state === 'ready' && i.student.photoVersion).length;
  const parts = [`${plural(bulkItems.length, 'file')} chosen: ${number(count('ready'))} ready to upload`];
  if (replacing) parts.push(`${number(replacing)} of them replace a photo`);
  if (count('skip')) parts.push(`${number(count('skip'))} skipped (see below)`);
  $('bulk-summary').textContent = `${parts.join(', ')}.`;
  $('bulk-list').hidden = bulkItems.length === 0;
  // Skipped files first, so problems are easy to see.
  const order = { skip: 0, failed: 0, ready: 1, done: 1 };
  $('bulk-rows').replaceChildren(...[...bulkItems].sort((a, b) => order[a.state] - order[b.state]).map((item) => {
    item.cell = el('td', {}, statusBadge(item));
    return el('tr', {},
      el('td', { className: 'mono', textContent: item.file.name }),
      el('td', { className: 'strong', textContent: item.student?.fullName ?? '' }),
      el('td', { textContent: item.student?.classLabel ?? '' }),
      item.cell);
  }));
  $('bulk-upload').hidden = count('ready') === 0;
  $('bulk-upload').textContent = `Upload ${plural(count('ready'), 'photo')}`;
}

$('bulk-open').addEventListener('click', () => {
  $('bulk-box').hidden = false;
  $('bulk-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('bulk-close').addEventListener('click', () => {
  $('bulk-box').hidden = true;
});

$('bulk-files').addEventListener('change', async () => {
  showMessage($('bulk-message'), '', '');
  try {
    bulkItems = await matchFiles($('bulk-files').files);
    showBulk();
  } catch (err) {
    showMessage($('bulk-message'), 'error', err.message);
  }
});

$('bulk-upload').addEventListener('click', async () => {
  const ready = bulkItems.filter((i) => i.state === 'ready');
  $('bulk-upload').disabled = true;
  $('bulk-files').disabled = true;
  let done = 0;
  for (const [n, item] of ready.entries()) {
    showMessage($('bulk-message'), 'info', `Uploading ${n + 1} of ${ready.length}: ${item.student.fullName}...`);
    try {
      await api(`/students/${item.student.id}/photo`, { method: 'PUT', body: await shrinkPhoto(item.file) });
      Object.assign(item, { state: 'done', note: 'Uploaded' });
      done++;
    } catch (err) {
      Object.assign(item, { state: 'failed', note: `Not uploaded: ${err.message}` });
    }
    item.cell.replaceChildren(statusBadge(item));
  }
  const failed = ready.length - done;
  showMessage($('bulk-message'), failed ? 'error' : 'ok', failed
    ? `Uploaded ${plural(done, 'photo')}. ${plural(failed, 'photo')} failed: see the list, fix those files, and choose them again.`
    : `Uploaded ${plural(done, 'photo')}. Gates show them within a few minutes.`);
  $('bulk-upload').hidden = true;
  $('bulk-upload').disabled = false;
  $('bulk-files').disabled = false;
  $('bulk-files').value = '';
  await loadClasses();
  await loadStudents();
});

currentUser.then((user) => {
  $('bulk-open').hidden = !['admin', 'staff'].includes(user.role);
});
