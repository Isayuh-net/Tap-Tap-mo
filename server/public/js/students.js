// Students page: how many students there are (by section and by sex), and the full list.
const $ = (id) => document.getElementById(id);
const SEX = { M: 'Male', F: 'Female' };
const number = (n) => n.toLocaleString('en-US');

function cell(tr, content) {
  const td = document.createElement('td');
  if (content instanceof Node) td.append(content);
  else td.textContent = content ?? '';
  tr.append(td);
  return td;
}

async function loadCounts() {
  const { classes } = await api('/students/classes');
  const sum = (key) => classes.reduce((total, c) => total + c[key], 0);
  $('total').textContent = number(sum('students'));
  $('sections').textContent = `in ${classes.length} section${classes.length === 1 ? '' : 's'}`;
  $('male').textContent = number(sum('male'));
  $('female').textContent = number(sum('female'));
  $('not-set').textContent = number(sum('sexNotSet'));

  $('class-rows').replaceChildren(...classes.map((c) => {
    const tr = document.createElement('tr');
    for (const value of [c.classLabel, c.male, c.female, c.sexNotSet, c.students, c.withoutCard, c.unverified]) cell(tr, value);
    return tr;
  }));
  const totals = document.createElement('tr');
  totals.className = 'total-row';
  for (const value of ['Total', sum('male'), sum('female'), sum('sexNotSet'), sum('students'), sum('withoutCard'), sum('unverified')]) cell(totals, value);
  $('class-rows').append(totals);

  for (const c of classes) $('class').add(new Option(c.classLabel, JSON.stringify([c.gradeLevel, c.strand, c.section])));
}

async function loadStudents() {
  const params = new URLSearchParams();
  if ($('search').value.trim()) params.set('q', $('search').value.trim());
  if ($('sex').value) params.set('sex', $('sex').value);
  if ($('class').value) {
    const [gradeLevel, strand, section] = JSON.parse($('class').value);
    params.set('gradeLevel', gradeLevel);
    params.set('strand', strand);
    params.set('section', section);
  }
  const { students } = await api(`/students?${params}`);
  $('count').textContent = `${number(students.length)} student${students.length === 1 ? '' : 's'} shown.`;
  $('rows').replaceChildren(...students.map((s) => {
    const tr = document.createElement('tr');
    cell(tr, s.cardNo ?? 'No card');
    cell(tr, s.fullName);
    cell(tr, SEX[s.sex] ?? 'Not set');
    cell(tr, s.classLabel);
    cell(tr, s.lrn);
    cell(tr, s.schoolId);
    const mobile = cell(tr, s.guardianMobile ?? 'None');
    if (s.guardianMobile && !s.mobileVerified) mobile.append(' ', Object.assign(document.createElement('span'), { className: 'badge waiting', textContent: 'Not verified' }));
    const edit = s.cardUid
      ? Object.assign(document.createElement('a'), { href: `register.html?uid=${encodeURIComponent(s.cardUid)}`, textContent: 'Edit' })
      : Object.assign(document.createElement('a'), { href: 'assign-cards.html', textContent: 'Assign a card' });
    cell(tr, edit);
    return tr;
  }));
}

let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadStudents, 300);
});
$('class').addEventListener('change', loadStudents);
$('sex').addEventListener('change', loadStudents);

loadCounts().catch((err) => { $('count').textContent = err.message; });
loadStudents();
