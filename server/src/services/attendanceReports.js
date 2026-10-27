// Attendance views: the dashboard's "today" view, and the daily and monthly reports. (US-09, US-10, US-13)
//
// Rules used everywhere (the school day is explained in attendance.js):
//  - Present = the student timed in that day. Late = their first time in was after LATE_AFTER.
//  - Late from lunch = came back after LUNCH_END. Left early = tapped out before DISMISSAL_TIME.
//  - Absent  = no time in on a school day. School days are Monday to Friday, except dates in the
//    holidays table, counted only from the day the student was added to the system.
const db = require('../db');
const config = require('../config');
const { classLabel } = require('../utils/classLabel');
const { schoolDate, schoolTime, displayTime, clockLabel, datesOfMonth, weekDates, daysBefore } = require('../utils/time');
const { schoolDayInfo } = require('./schoolDays');
const { MOVEMENTS } = require('./attendance');

// Filters shared by every view: { gradeLevel, strand, section, q } -> SQL for the students table "s".
function studentFilter({ gradeLevel, strand, section, q } = {}) {
  const where = ['s.active = 1'];
  const params = [];
  if (gradeLevel) { where.push('s.grade_level = ?'); params.push(Number(gradeLevel)); }
  if (strand) { where.push('s.strand = ?'); params.push(strand); }
  if (section) { where.push('s.section = ?'); params.push(section); }
  if (q) { where.push('s.full_name LIKE ?'); params.push(`%${q}%`); }
  return { sql: where.join(' AND '), params };
}

// "09171234567" -> "0917 *** 4567", so numbers aren't fully shown on a screen others can see.
function maskMobile(mobile) {
  return mobile ? `${mobile.slice(0, 4)} *** ${mobile.slice(-4)}` : null;
}

const TYPE_LABELS = {
  time_in: 'Time in', lunch_out: 'Lunch out', lunch_in: 'Back from lunch', time_out: 'Time out', early_out: 'Early out',
};

// Taps that text the parent: arriving, leaving, leaving early, and coming back late from lunch.
const isTexted = (result, isLate) => ['time_in', 'time_out', 'early_out'].includes(result) || (result === 'lunch_in' && isLate);

const time = (iso) => (iso ? displayTime(new Date(iso)) : '');
const addedOn = (student) => schoolDate(new Date(student.created_at));

// The dashboard: counts and every time in / time out today, newest first, with its text status.
function today(filters = {}) {
  const date = schoolDate();
  const f = studentFilter(filters);
  const count = (sql, ...params) => db.prepare(sql).get(...params, ...f.params).n;

  const students = count(`SELECT COUNT(*) AS n FROM students s WHERE ${f.sql}`);
  const present = count(`
    SELECT COUNT(DISTINCT t.student_id) AS n FROM taps t JOIN students s ON s.id = t.student_id
    WHERE t.school_date = ? AND t.result = 'time_in' AND ${f.sql}`, date);
  const late = count(`
    SELECT COUNT(DISTINCT t.student_id) AS n FROM taps t JOIN students s ON s.id = t.student_id
    WHERE t.school_date = ? AND t.result = 'time_in' AND t.is_late = 1 AND ${f.sql}`, date);
  const lateFromLunch = count(`
    SELECT COUNT(DISTINCT t.student_id) AS n FROM taps t JOIN students s ON s.id = t.student_id
    WHERE t.school_date = ? AND t.result = 'lunch_in' AND t.is_late = 1 AND ${f.sql}`, date);
  const leftEarly = count(`
    SELECT COUNT(DISTINCT t.student_id) AS n FROM taps t JOIN students s ON s.id = t.student_id
    WHERE t.school_date = ? AND t.result = 'early_out' AND ${f.sql}`, date);
  const unregisteredTaps = db.prepare(
    "SELECT COUNT(*) AS n FROM taps WHERE school_date = ? AND result = 'unregistered'",
  ).get(date).n;

  const taps = db.prepare(`
    SELECT t.tapped_at, t.result, t.is_late, t.gate_id, s.id AS student_id, s.full_name, s.grade_level,
           s.strand, s.section, s.guardian_mobile, s.mobile_verified_at, m.status AS text_status, m.last_error
    FROM taps t
    JOIN students s ON s.id = t.student_id
    LEFT JOIN sms_messages m ON m.tap_id = t.id
    WHERE t.school_date = ? AND t.result IN (${MOVEMENTS.map(() => '?').join(', ')}) AND ${f.sql}
    ORDER BY t.tapped_at DESC
    LIMIT 500
  `).all(date, ...MOVEMENTS, ...f.params).map((r) => ({
    time: time(r.tapped_at),
    studentId: r.student_id,
    name: r.full_name,
    classLabel: classLabel(r),
    type: TYPE_LABELS[r.result],
    isLate: Boolean(r.is_late),
    gate: r.gate_id,
    parentMobile: maskMobile(r.guardian_mobile),
    // No text row: lunch taps aren't texted ('not-needed'); otherwise the number wasn't verified ('none').
    textStatus: r.text_status ?? (isTexted(r.result, r.is_late) ? 'none' : 'not-needed'),
    textError: r.last_error,
  }));

  return {
    date,
    ...schoolDayInfo(date),
    lateAfter: clockLabel(config.schedule.lateAfter),
    lunchEnd: clockLabel(config.schedule.lunchEnd),
    dismissal: clockLabel(config.schedule.dismissal),
    students,
    present,
    late,
    lateFromLunch,
    leftEarly,
    absent: students - present,
    unregisteredTaps,
    taps,
  };
}

// Students for a report, in class order, who were already in the system on `lastDate`.
function reportStudents(filters, lastDate) {
  const f = studentFilter(filters);
  return db.prepare(`SELECT s.* FROM students s WHERE ${f.sql} ORDER BY s.grade_level, s.strand, s.section, s.full_name`)
    .all(...f.params)
    .filter((s) => addedOn(s) <= lastDate);
}

// One row per student for one day: time in, time out, Present / Late / Absent, and notes for
// coming back late from lunch or leaving early.
function daily(date, filters = {}) {
  const day = schoolDayInfo(date);
  const byStudent = new Map(db.prepare(`
    SELECT student_id,
           MIN(CASE WHEN result = 'time_in' THEN tapped_at END) AS first_in,
           MAX(CASE WHEN result IN ('time_out', 'early_out') THEN tapped_at END) AS last_out,
           MAX(CASE WHEN result = 'time_in' THEN is_late ELSE 0 END) AS late,
           MAX(CASE WHEN result = 'lunch_in' AND is_late = 1 THEN tapped_at END) AS late_from_lunch,
           MAX(CASE WHEN result = 'early_out' THEN tapped_at END) AS early_out
    FROM taps WHERE school_date = ?
    GROUP BY student_id
  `).all(date).map((r) => [r.student_id, r]));

  const rows = reportStudents(filters, date).map((s) => {
    const t = byStudent.get(s.id);
    let status = day.schoolDay ? 'Absent' : 'No classes';
    if (t?.first_in) status = t.late ? 'Late' : 'Present';
    return {
      lrn: s.lrn,
      name: s.full_name,
      gradeLevel: s.grade_level,
      strand: s.strand,
      section: s.section,
      classLabel: classLabel(s),
      timeIn: time(t?.first_in),
      timeOut: time(t?.last_out),
      status,
      notes: [
        t?.late_from_lunch && `Late from lunch (${time(t.late_from_lunch)})`,
        t?.early_out && `Left early (${time(t.early_out)})`,
      ].filter(Boolean).join('; '),
    };
  });

  const count = (status) => rows.filter((r) => r.status === status).length;
  return {
    date,
    ...day,
    summary: {
      students: rows.length,
      present: count('Present') + count('Late'),
      late: count('Late'),
      absent: count('Absent'),
      lateFromLunch: rows.filter((r) => r.notes.includes('Late from lunch')).length,
      leftEarly: rows.filter((r) => r.notes.includes('Left early')).length,
    },
    rows,
  };
}

// One row per student for a month: school days, present, late, absent, late from lunch, left early
// and attendance %.
// Days after today aren't counted yet.
function monthly(month, filters = {}) {
  const todayDate = schoolDate();
  const days = datesOfMonth(month).filter((d) => d <= todayDate && schoolDayInfo(d).schoolDay);
  const holidays = db.prepare("SELECT date, name FROM holidays WHERE date LIKE ? ORDER BY date").all(`${month}-%`);

  // Each student's days with a time in, and whether that first time in was late.
  const attended = new Map();
  for (const r of db.prepare(`
    SELECT student_id, school_date, MAX(is_late) AS late FROM taps
    WHERE result = 'time_in' AND school_date LIKE ?
    GROUP BY student_id, school_date
  `).all(`${month}-%`)) {
    if (!attended.has(r.student_id)) attended.set(r.student_id, new Map());
    attended.get(r.student_id).set(r.school_date, Boolean(r.late));
  }

  // Days each student came back late from lunch or left early.
  const lunchLateDays = new Map();
  const earlyDays = new Map();
  for (const r of db.prepare(`
    SELECT student_id, school_date,
           MAX(result = 'lunch_in' AND is_late = 1) AS lunch_late, MAX(result = 'early_out') AS early
    FROM taps WHERE school_date LIKE ? AND result IN ('lunch_in', 'early_out')
    GROUP BY student_id, school_date
  `).all(`${month}-%`)) {
    for (const [map, flag] of [[lunchLateDays, r.lunch_late], [earlyDays, r.early]]) {
      if (!flag) continue;
      if (!map.has(r.student_id)) map.set(r.student_id, new Set());
      map.get(r.student_id).add(r.school_date);
    }
  }

  const lastDate = days.at(-1) ?? `${month}-01`;
  const rows = reportStudents(filters, lastDate).map((s) => {
    const counted = days.filter((d) => d >= addedOn(s));
    const theirs = attended.get(s.id) ?? new Map();
    const presentDays = counted.filter((d) => theirs.has(d));
    const lateDays = presentDays.filter((d) => theirs.get(d));
    return {
      lrn: s.lrn,
      name: s.full_name,
      gradeLevel: s.grade_level,
      strand: s.strand,
      section: s.section,
      classLabel: classLabel(s),
      schoolDays: counted.length,
      present: presentDays.length,
      late: lateDays.length,
      absent: counted.length - presentDays.length,
      lateFromLunch: counted.filter((d) => lunchLateDays.get(s.id)?.has(d)).length,
      leftEarly: counted.filter((d) => earlyDays.get(s.id)?.has(d)).length,
      percent: counted.length ? Math.round((presentDays.length / counted.length) * 100) : null,
    };
  });

  return { month, schoolDays: days.length, holidays, rows };
}

// Per-day counts for a list of dates, for the students matching the filters.
// A day "counts" when it is a school day that has started: past school days, and today once
// classes have begun (so Monday at 7 AM doesn't show 0% attendance).
function dayStats(dates, filters) {
  const f = studentFilter(filters);
  const students = db.prepare(`SELECT s.created_at FROM students s WHERE ${f.sql}`).all(...f.params);
  const byDate = new Map(db.prepare(`
    SELECT t.school_date,
           COUNT(DISTINCT CASE WHEN t.result = 'time_in' THEN t.student_id END) AS present,
           COUNT(DISTINCT CASE WHEN t.result = 'time_in' AND t.is_late = 1 THEN t.student_id END) AS late,
           COUNT(DISTINCT CASE WHEN t.result = 'lunch_in' AND t.is_late = 1 THEN t.student_id END) AS late_from_lunch,
           COUNT(DISTINCT CASE WHEN t.result = 'early_out' THEN t.student_id END) AS left_early
    FROM taps t JOIN students s ON s.id = t.student_id
    WHERE t.school_date BETWEEN ? AND ? AND ${f.sql}
    GROUP BY t.school_date
  `).all(dates[0], dates.at(-1), ...f.params).map((r) => [r.school_date, r]));

  const todayDate = schoolDate();
  const classesStarted = schoolTime() > config.schedule.lateAfter;
  return dates.map((date) => {
    const { schoolDay, holiday } = schoolDayInfo(date);
    const counts = date < todayDate || (date === todayDate && classesStarted);
    const enrolled = students.filter((st) => addedOn(st) <= date).length;
    const t = byDate.get(date) ?? { present: 0, late: 0, late_from_lunch: 0, left_early: 0 };
    return {
      date,
      weekday: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      schoolDay,
      holiday,
      counts: schoolDay && counts && enrolled > 0,
      future: date > todayDate,
      enrolled,
      present: t.present,
      absent: Math.max(enrolled - t.present, 0),
      late: t.late,
      lateFromLunch: t.late_from_lunch,
      leftEarly: t.left_early,
      attendanceRate: enrolled ? Math.round((t.present / enrolled) * 1000) / 10 : null,
    };
  });
}

// Averages over the days that count: attendance = present / enrolled, tardiness = late arrivals / arrivals.
function averages(days) {
  const counted = days.filter((d) => d.counts);
  const sum = (key) => counted.reduce((total, d) => total + d[key], 0);
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
  return {
    schoolDays: counted.length,
    averageAttendance: pct(sum('present'), sum('enrolled')),
    tardinessRate: pct(sum('late'), sum('present')),
    lateArrivals: sum('late'),
    lateFromLunch: sum('lateFromLunch'),
    leftEarly: sum('leftEarly'),
    absences: sum('absent'),
  };
}

// The dashboard's weekly summary: Monday to Friday of the week containing `weekOf`, compared with
// the week before, plus the students most often late. (US-09, US-13)
function week(weekOf, filters = {}) {
  const dates = weekDates(weekOf);
  const days = dayStats(dates, filters);
  const lastWeek = averages(dayStats(weekDates(daysBefore(dates[0], 7)), filters));

  const f = studentFilter(filters);
  const counted = days.filter((d) => d.counts).map((d) => d.date);
  const mostLate = counted.length ? db.prepare(`
    SELECT s.id, s.full_name, s.grade_level, s.strand, s.section,
           COUNT(DISTINCT CASE WHEN t.result = 'time_in' AND t.is_late = 1 THEN t.school_date END) AS late,
           COUNT(DISTINCT CASE WHEN t.result = 'lunch_in' AND t.is_late = 1 THEN t.school_date END) AS late_from_lunch
    FROM taps t JOIN students s ON s.id = t.student_id
    WHERE t.school_date IN (${counted.map(() => '?').join(', ')}) AND t.is_late = 1 AND ${f.sql}
    GROUP BY s.id
    ORDER BY late + late_from_lunch DESC, s.full_name
    LIMIT 5
  `).all(...counted, ...f.params).map((r) => ({
    name: r.full_name, classLabel: classLabel(r), late: r.late, lateFromLunch: r.late_from_lunch,
  })) : [];

  return {
    weekStart: dates[0],
    weekEnd: dates.at(-1),
    isThisWeek: weekDates(schoolDate())[0] === dates[0],
    classesStart: clockLabel(config.schedule.lateAfter),
    days,
    summary: averages(days),
    lastWeek: { averageAttendance: lastWeek.averageAttendance, tardinessRate: lastWeek.tardinessRate },
    mostLate,
  };
}

module.exports = { today, daily, monthly, week };
