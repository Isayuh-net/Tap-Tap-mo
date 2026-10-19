// Assign cards page: tap cards one after another; each tap goes to the next student without a card.
const $ = (id) => document.getElementById(id);
const message = $('message');

let students = [];      // the chosen class, sorted by name
let nextIndex = -1;     // the student the next tap goes to (-1 = none left)
const skipped = new Set(); // ids of students skipped this session (absent)
const undoStack = [];   // [{ uid, index }] cards assigned this session, newest last

// Keep the reader's typing going into the card box, unless staff are choosing a class.
setInterval(() => {
  if (!$('tap-panel').hidden && document.activeElement !== $('class')) $('uid').focus();
}, 500);

async function loadClasses() {
  const { classes } = await api('/students/classes');
  const select = $('class');
  const chosen = select.value;
  select.replaceChildren(new Option('Choose a class...', ''));
  for (const c of classes) {
    const value = JSON.stringify([c.gradeLevel, c.strand, c.section]);
    select.add(new Option(`${c.classLabel} (${c.withoutCard} of ${c.students} without cards)`, value));
  }
  select.value = chosen;
}

$('class').addEventListener('change', async () => {
  showMessage(message, '', '');
  if (!$('class').value) {
    $('tap-panel').hidden = true;
    $('list').hidden = true;
    return;
  }
  const [gradeLevel, strand, section] = JSON.parse($('class').value);
  const query = new URLSearchParams({ gradeLevel, strand, section });
  ({ students } = await api(`/students?${query}`));
  skipped.clear();
  undoStack.length = 0;
  pickNext(0);
  render();
  $('uid').focus();
});

// The first student without a card at or after `from` (wrapping around). Skipped students
// come up again only when everyone else has a card.
function pickNext(from) {
  const order = [...students.keys()];
  const rotated = order.slice(from).concat(order.slice(0, from));
  nextIndex = rotated.find((i) => !students[i].cardUid && !skipped.has(students[i].id))
    ?? rotated.find((i) => !students[i].cardUid)
    ?? -1;
}

function render() {
  $('tap-panel').hidden = false;
  $('list').hidden = false;
  const done = students.filter((s) => s.cardUid).length;
  $('progress').textContent = `${done} of ${students.length} students have cards.`;
  $('undo').disabled = undoStack.length === 0;

  const next = students[nextIndex];
  $('next-name').textContent = next ? next.fullName : 'Everyone in this class has a card.';
  $('next-detail').textContent = next ? `${next.classLabel}${skipped.has(next.id) ? ' (skipped earlier)' : ''}` : '';
  $('uid').disabled = !next;
  $('skip').disabled = !next;

  $('rows').replaceChildren(...students.map((s, i) => {
    const tr = document.createElement('tr');
    if (i === nextIndex) tr.className = 'next-row';
    const cells = [
      i + 1,
      s.fullName,
      s.cardUid ?? (skipped.has(s.id) ? 'Skipped' : ''),
      s.guardianMobile ? `${s.guardianMobile}${s.mobileVerified ? ' (verified)' : ''}` : 'None',
    ];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    const action = document.createElement('td');
    if (!s.cardUid && i !== nextIndex) {
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.textContent = 'Tap this one next';
      choose.addEventListener('click', () => {
        skipped.delete(s.id);
        nextIndex = i;
        render();
      });
      action.append(choose);
    }
    tr.append(action);
    return tr;
  }));
}

function beep(frequency) {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.frequency.value = frequency;
  osc.connect(ctx.destination);
  osc.start();
  setTimeout(() => { osc.stop(); ctx.close(); }, 150);
}

// The reader types the card number and presses Enter.
$('uid').addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const uid = $('uid').value.trim();
  $('uid').value = '';
  const student = students[nextIndex];
  if (!uid || !student) return;
  try {
    const updated = await api('/cards', { method: 'POST', body: { uid, studentId: student.id } });
    const index = nextIndex;
    students[index] = updated;
    undoStack.push({ uid: updated.cardUid, index });
    showMessage(message, 'ok', `Card ${updated.cardUid} is now ${updated.fullName}'s.`);
    beep(880);
    pickNext(index + 1);
    render();
    loadClasses(); // update the "without cards" counts
  } catch (err) {
    showMessage(message, 'error', err.message);
    beep(300);
  }
});

$('skip').addEventListener('click', () => {
  const student = students[nextIndex];
  skipped.add(student.id);
  pickNext(nextIndex + 1);
  showMessage(message, 'info', `Skipped ${student.fullName}. They come up again after everyone else.`);
  render();
});

$('undo').addEventListener('click', async () => {
  const last = undoStack.at(-1);
  try {
    await api(`/cards/${encodeURIComponent(last.uid)}`, { method: 'DELETE' });
    undoStack.pop();
    const student = students[last.index];
    student.cardUid = null;
    nextIndex = last.index;
    showMessage(message, 'info', `Card ${last.uid} removed from ${student.fullName}. Tap the right card for them.`);
    render();
    loadClasses();
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
});

loadClasses().catch((err) => showMessage(message, 'error', err.message));
