// Dashboard "Attendance summary this week": average attendance (compared with the week before),
// tardiness, late from lunch and absences, then each day with an attendance bar, and the students
// most often late. Every number is written out, so nothing depends on hovering. Uses $ from dashboard.js.
let weekOf = null; // any date in the week shown; null = this week
let classesStart = '8:00 AM'; // from the server's schedule

const pctText = (value) => (value === null ? '-' : `${value.toFixed(1)}%`);
const utcDate = (date, options) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });

// The class filter at the top of the page, without the name search (that only filters the tap list).
function classParams() {
  const params = new URLSearchParams();
  if ($('class').value) {
    const [gradeLevel, strand, section] = JSON.parse($('class').value);
    params.set('gradeLevel', gradeLevel);
    params.set('strand', strand);
    params.set('section', section);
  }
  if (weekOf) params.set('weekOf', weekOf);
  return params;
}

function shiftWeek(fromDate, days) {
  const date = new Date(`${fromDate}T00:00:00Z`);
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// "Up from 93.8% the week before"
function compareText(current, previous) {
  if (current === null) return { text: 'No school days counted yet', kind: '' };
  if (previous === null) return { text: 'No numbers for the week before', kind: '' };
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return { text: `Same as the week before (${pctText(previous)})`, kind: '' };
  return { text: `${diff > 0 ? 'Up' : 'Down'} from ${pctText(previous)} the week before`, kind: diff > 0 ? 'good' : 'bad' };
}

// "November 9 to 13, 2026" (or "October 26 to November 1, 2026")
function rangeText(start, end) {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${utcDate(start, { month: 'long', day: 'numeric' })} to ${sameMonth ? Number(end.slice(8)) : utcDate(end, { month: 'long', day: 'numeric' })}, ${end.slice(0, 4)}`;
}

function dayRow(day) {
  const tr = document.createElement('tr');
  const name = Object.assign(document.createElement('td'), { className: 'strong', textContent: utcDate(day.date, { weekday: 'long' }) });
  name.title = utcDate(day.date, { month: 'long', day: 'numeric', year: 'numeric' });
  tr.append(name);
  const attendance = document.createElement('td');
  if (day.counts) {
    const bar = document.createElement('div');
    bar.className = 'bar-cell';
    bar.title = `${day.present} of ${day.enrolled} present, ${day.absent} absent`;
    const track = Object.assign(document.createElement('div'), { className: 'bar-track' });
    const fill = Object.assign(document.createElement('div'), { className: 'bar-fill' });
    fill.style.width = `${day.attendanceRate}%`;
    track.append(fill);
    bar.append(track, Object.assign(document.createElement('span'), { className: 'bar-value', textContent: pctText(day.attendanceRate) }));
    attendance.append(bar);
  } else {
    // A holiday, a day that hasn't come yet, today before classes start, or no students yet.
    let why = day.future ? 'Not yet' : 'No classes';
    if (day.holiday) why = `Holiday: ${day.holiday}`;
    else if (day.schoolDay && !day.future && !day.enrolled) why = 'No students yet';
    else if (day.schoolDay && !day.future) why = `Counted from ${classesStart}`;
    attendance.className = 'muted-cell';
    attendance.textContent = why;
  }
  tr.append(attendance);
  for (const value of [day.late, day.lateFromLunch]) {
    tr.append(Object.assign(document.createElement('td'), { className: 'num', textContent: day.counts ? value : '' }));
  }
  return tr;
}

function renderWeek(data) {
  classesStart = data.classesStart;
  const s = data.summary;
  $('week-title').textContent = data.isThisWeek ? 'Attendance summary this week' : `Attendance summary, week of ${utcDate(data.weekStart, { month: 'long', day: 'numeric' })}`;
  $('week-range').textContent = `${rangeText(data.weekStart, data.weekEnd)}, ${s.schoolDays} school day${s.schoolDays === 1 ? '' : 's'}`;
  $('week-this').hidden = data.isThisWeek;
  $('week-next').disabled = data.isThisWeek;

  $('avg-attendance').textContent = pctText(s.averageAttendance);
  const compared = compareText(s.averageAttendance, data.lastWeek.averageAttendance);
  $('avg-attendance-note').textContent = compared.text;
  $('avg-attendance-note').className = `note ${compared.kind}`;
  $('tardiness').textContent = pctText(s.tardinessRate);
  $('tardiness-note').textContent = `${s.lateArrivals.toLocaleString('en-US')} of ${s.arrivals.toLocaleString('en-US')} arrivals were late`;
  $('week-lunch').textContent = s.lateFromLunch.toLocaleString('en-US');
  $('week-lunch-note').textContent = `taps after ${data.lunchEnd} this week`;
  $('absences').textContent = s.absences.toLocaleString('en-US');

  $('week-rows').replaceChildren(...data.days.map(dayRow));

  $('most-late').replaceChildren(...(data.mostLate.length ? data.mostLate.map((st) => {
    const parts = [st.late && `${st.late} morning`, st.lateFromLunch && `${st.lateFromLunch} from lunch`].filter(Boolean);
    const chip = Object.assign(document.createElement('div'), { className: 'person-chip' });
    chip.append(
      Object.assign(document.createElement('strong'), { textContent: st.name }),
      Object.assign(document.createElement('span'), { textContent: `${st.classLabel} · late ${parts.join(', ')}` }),
    );
    return chip;
  }) : [Object.assign(document.createElement('p'), { className: 'note', textContent: 'Nobody was late.' })]));
}

async function loadWeek() {
  $('week-rows').closest('.week').classList.add('refreshing'); // keep the old view while loading
  try {
    renderWeek(await api(`/attendance/week?${classParams()}`));
  } catch (err) {
    showMessage($('notice'), 'error', `Could not load the weekly summary: ${err.message}`);
  } finally {
    $('week-rows').closest('.week').classList.remove('refreshing');
  }
}

const todayInManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
$('week-prev').addEventListener('click', () => {
  weekOf = shiftWeek(weekOf ?? todayInManila(), -7);
  loadWeek();
});
$('week-next').addEventListener('click', () => {
  weekOf = shiftWeek(weekOf ?? todayInManila(), 7);
  loadWeek();
});
$('week-this').addEventListener('click', () => {
  weekOf = null;
  loadWeek();
});
$('class').addEventListener('change', loadWeek);

loadWeek();
setInterval(() => { if (!weekOf) loadWeek(); }, 60 * 1000); // this week keeps updating
