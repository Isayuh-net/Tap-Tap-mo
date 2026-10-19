// Attendance views: the dashboard's "today" view, and the daily and monthly reports. (US-09, US-10, US-13)
//
// Rules used everywhere:
//  - Present = the student timed in that day. Late = their first time in was after LATE_AFTER.
//  - Absent  = no time in on a school day. School days are Monday to Friday, except dates in the
//    holidays table, counted only from the day the student was added to the system.
const db = require('../db');
const config = require('../config');
const { classLabel } = require('../utils/classLabel');
const { schoolDate, displayTime, datesOfMonth } = require('../utils/time');
const { schoolDayInfo } = require('./schoolDays');

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

// "07:30:00" -> "7:30 AM"
function lateAfterLabel() {
  const [h, m] = config.lateAfter.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

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
  const unregisteredTaps = db.prepare(
    "SELECT COUNT(*) AS n FROM taps WHERE school_date = ? AND result = 'unregistered'",
  ).get(date).n;

  const taps = db.prepare(`
    SELECT t.tapped_at, t.result, t.is_late, t.gate_id, s.id AS student_id, s.full_name, s.grade_level,
           s.strand, s.section, s.guardian_mobile, s.mobile_verified_at, m.status AS text_status, m.last_error
    FROM taps t
    JOIN students s ON s.id = t.student_id
    LEFT JOIN sms_messages m ON m.tap_id = t.id
    WHERE t.school_date = ? AND t.result IN ('time_in', 'time_out') AND ${f.sql}
    ORDER BY t.tapped_at DESC
    LIMIT 500
  `).all(date, ...f.params).map((r) => ({
    time: time(r.tapped_at),
    studentId: r.student_id,
    name: r.full_name,
    classLabel: classLabel(r),
    type: r.result === 'time_in' ? 'Time in' : 'Time out',
    isLate: Boolean(r.is_late),
    gate: r.gate_id,
    parentMobile: maskMobile(r.guardian_mobile),
    // no text row: the parent's number wasn't verified when the student tapped
    textStatus: r.text_status ?? 'none',
    textError: r.last_error,
  }));

  return {
    date,
    ...schoolDayInfo(date),
    lateAfter: lateAfterLabel(),
    students,
    present,
    late,
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

// One row per student for one day: time in, time out and Present / Late / Absent.
function daily(date, filters = {}) {
  const day = schoolDayInfo(date);
  const byStudent = new Map(db.prepare(`
    SELECT student_id,
           MIN(CASE WHEN result = 'time_in' THEN tapped_at END) AS first_in,
           MAX(CASE WHEN result = 'time_out' THEN tapped_at END) AS last_out,
           MAX(is_late) AS late
    FROM taps WHERE school_date = ? AND result IN ('time_in', 'time_out')
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
    };
  });

  const count = (status) => rows.filter((r) => r.status === status).length;
  return {
    date,
    ...day,
    summary: { students: rows.length, present: count('Present') + count('Late'), late: count('Late'), absent: count('Absent') },
    rows,
  };
}

// One row per student for a month: school days, present, late, absent and attendance %.
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
      percent: counted.length ? Math.round((presentDays.length / counted.length) * 100) : null,
    };
  });

  return { month, schoolDays: days.length, holidays, rows };
}

module.exports = { today, daily, monthly };
