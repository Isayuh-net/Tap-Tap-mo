// Dashboard "This week" summary: average attendance and tardiness (compared with last week),
// late arrivals, absences, two column charts by day, the students most often late, and a table
// with every number (so nothing is only readable by hovering). Uses $ from dashboard.js.
let weekOf = null; // any date in the week shown; null = this week
let classesStart = '8:00 AM'; // from the server's schedule

const pctText = (value) => (value === null ? '-' : `${value.toFixed(1)}%`);
const shortDay = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

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

// "▲ 2.1 pts vs last week". upIsGood: true for attendance, false for tardiness.
function showDelta(el, current, previous, upIsGood) {
  if (current === null || previous === null) {
    el.className = 'stat-delta';
    el.textContent = previous === null ? 'No data for the week before' : '';
    return;
  }
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) {
    el.className = 'stat-delta';
    el.textContent = 'Same as the week before';
    return;
  }
  const good = diff > 0 === upIsGood;
  el.className = `stat-delta ${good ? 'good' : 'bad'}`;
  el.textContent = `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)} pts vs the week before`;
}

// ---- Tooltip: one for both charts, on hover and keyboard focus ----
const tip = $('chart-tip');
function showTip(target, value, lines) {
  const strong = Object.assign(document.createElement('strong'), { textContent: value });
  tip.replaceChildren(strong, ...lines.map((line) => Object.assign(document.createElement('div'), { textContent: line })));
  tip.hidden = false;
  const box = target.getBoundingClientRect();
  const section = tip.parentElement.getBoundingClientRect();
  tip.style.left = `${box.left - section.left + box.width / 2}px`;
  tip.style.top = `${box.top - section.top}px`;
}
function hideTip() {
  tip.hidden = true;
}

// A column chart: one column per weekday. value(day) is the column height (0 to max),
// label(day) is written on the column's cap, tooltip(day) gives [value, ...lines].
function columnChart(container, days, { max, value, label, tooltip }) {
  container.replaceChildren(...days.map((day) => {
    const col = document.createElement('div');
    col.className = 'col';
    const plot = document.createElement('div');
    plot.className = 'plot';
    if (day.counts) {
      const cap = Object.assign(document.createElement('div'), { className: 'cap', textContent: label(day) });
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = `${Math.max((value(day) / max) * 100, value(day) > 0 ? 2 : 0)}%`;
      plot.append(cap, bar);
      // The whole column is the hover target, not just the painted bar.
      col.tabIndex = 0;
      const [tipValue, ...lines] = tooltip(day);
      col.setAttribute('aria-label', `${shortDay(day.date)}: ${tipValue}. ${lines.join('. ')}`);
      col.addEventListener('pointerenter', () => showTip(col, tipValue, [shortDay(day.date), ...lines]));
      col.addEventListener('focus', () => showTip(col, tipValue, [shortDay(day.date), ...lines]));
      col.addEventListener('pointerleave', hideTip);
      col.addEventListener('blur', hideTip);
    } else {
      // No bar: a holiday, a weekend, a day that hasn't come yet, or no students yet.
      let why = day.future ? 'Not yet' : 'No classes';
      if (day.holiday) why = day.holiday;
      else if (day.schoolDay && !day.future && !day.enrolled) why = 'No students';
      else if (day.schoolDay && !day.future) why = `From ${classesStart}`; // today, before classes begin
      plot.append(Object.assign(document.createElement('div'), { className: 'cap muted', textContent: why }));
    }
    const x = Object.assign(document.createElement('div'), { className: 'x-label', textContent: day.weekday });
    col.append(plot, x);
    return col;
  }));
}

function renderWeek(data) {
  classesStart = data.classesStart;
  const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  $('week-title').textContent = data.isThisWeek ? 'This week' : 'Week of';
  $('week-range').textContent = `${fmt(data.weekStart)} to ${fmt(data.weekEnd)}, ${data.weekEnd.slice(0, 4)}`
    + ` | ${data.summary.schoolDays} school day${data.summary.schoolDays === 1 ? '' : 's'} counted`;
  $('week-this').hidden = data.isThisWeek;
  $('week-next').disabled = data.isThisWeek;

  const s = data.summary;
  $('avg-attendance').textContent = pctText(s.averageAttendance);
  showDelta($('avg-attendance-delta'), s.averageAttendance, data.lastWeek.averageAttendance, true);
  $('tardiness').textContent = pctText(s.tardinessRate);
  showDelta($('tardiness-delta'), s.tardinessRate, data.lastWeek.tardinessRate, false);
  $('late-arrivals').textContent = s.lateArrivals.toLocaleString('en-US');
  $('late-arrivals-note').textContent = `in the morning
+ ${s.lateFromLunch} late from lunch, ${s.leftEarly} left early`;
  $('absences').textContent = s.absences.toLocaleString('en-US');

  columnChart($('chart-attendance'), data.days, {
    max: 100,
    value: (d) => d.attendanceRate,
    label: (d) => `${Math.round(d.attendanceRate)}%`,
    tooltip: (d) => [`${pctText(d.attendanceRate)} attendance`, `${d.present} of ${d.enrolled} present`, `${d.absent} absent`],
  });
  const lateMax = Math.max(1, ...data.days.filter((d) => d.counts).map((d) => d.late + d.lateFromLunch));
  columnChart($('chart-late'), data.days, {
    max: lateMax,
    value: (d) => d.late + d.lateFromLunch,
    label: (d) => String(d.late + d.lateFromLunch),
    tooltip: (d) => [`${d.late + d.lateFromLunch} late`, `${d.late} in the morning`, `${d.lateFromLunch} from lunch`],
  });

  $('most-late').replaceChildren(...(data.mostLate.length ? data.mostLate.map((st) => {
    const li = document.createElement('li');
    const parts = [st.late && `${st.late} morning`, st.lateFromLunch && `${st.lateFromLunch} from lunch`].filter(Boolean);
    li.append(
      Object.assign(document.createElement('strong'), { textContent: st.name }),
      Object.assign(document.createElement('div'), { className: 'note', textContent: `${st.classLabel} | late ${parts.join(', ')}` }),
    );
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'note', textContent: 'Nobody was late.' })]));

  $('week-rows').replaceChildren(...data.days.map((d) => {
    const tr = document.createElement('tr');
    const cells = d.counts
      ? [shortDay(d.date), d.enrolled, d.present, d.absent, pctText(d.attendanceRate), d.late, d.lateFromLunch, d.leftEarly]
      : [shortDay(d.date), d.holiday ?? (d.future ? 'Not yet' : 'No classes'), '', '', '', '', '', ''];
    for (const c of cells) tr.append(Object.assign(document.createElement('td'), { textContent: c }));
    return tr;
  }));
}

async function loadWeek() {
  $('chart-attendance').closest('.week').classList.add('refreshing'); // keep the old view while loading
  try {
    renderWeek(await api(`/attendance/week?${classParams()}`));
  } catch (err) {
    showMessage($('notice'), 'error', `Could not load the weekly summary: ${err.message}`);
  } finally {
    $('chart-attendance').closest('.week').classList.remove('refreshing');
  }
}

$('week-prev').addEventListener('click', () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  weekOf = shiftWeek(weekOf ?? today, -7);
  loadWeek();
});
$('week-next').addEventListener('click', () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  weekOf = shiftWeek(weekOf ?? today, 7);
  loadWeek();
});
$('week-this').addEventListener('click', () => {
  weekOf = null;
  loadWeek();
});
$('class').addEventListener('change', loadWeek);

loadWeek();
setInterval(() => { if (!weekOf) loadWeek(); }, 60 * 1000); // this week keeps updating
