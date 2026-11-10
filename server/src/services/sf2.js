// Monthly attendance as an Excel file in the layout of DepEd School Form 2 (SF2, Daily Attendance
// Report of Learners): one sheet per section, boys first then girls, one column per weekday of the
// month, and totals per sex. (US-13)
//
// Marks: blank = present, x = absent, L = late in the morning, LB = came back late from lunch,
// H = holiday, - = not yet in the system that day. Future days are left empty.
const ExcelJS = require('exceljs');
const db = require('../db');
const config = require('../config');
const { classLabel } = require('../utils/classLabel');
const { schoolDate, datesOfMonth, isWeekday } = require('../utils/time');
const { schoolDayInfo } = require('./schoolDays');

const COLORS = { absent: 'FFFBE4E2', late: 'FFFDF1E3', holiday: 'FFE5E5E5', header: 'FFF0EFE9', group: 'FFE8F0FB' };
const SEX_GROUPS = [['M', 'MALE'], ['F', 'FEMALE'], [null, 'NOT SPECIFIED']];
const thin = { style: 'thin', color: { argb: 'FFBBBBBB' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

const addedOn = (student) => schoolDate(new Date(student.created_at));

// The students to include, by class: { classLabel -> [students] } in grade, strand, section order.
function studentsByClass({ gradeLevel, strand, section }, lastDate) {
  const where = ['active = 1'];
  const params = [];
  if (gradeLevel) { where.push('grade_level = ?'); params.push(Number(gradeLevel)); }
  if (strand) { where.push('strand = ?'); params.push(strand); }
  if (section) { where.push('section = ?'); params.push(section); }
  const rows = db.prepare(`
    SELECT * FROM students WHERE ${where.join(' AND ')}
    ORDER BY grade_level, strand, section, full_name
  `).all(...params).filter((s) => addedOn(s) <= lastDate);
  const groups = new Map();
  for (const s of rows) {
    const label = classLabel(s);
    if (!groups.has(label)) groups.set(label, { gradeLevel: s.grade_level, strand: s.strand, section: s.section, students: [] });
    groups.get(label).students.push(s);
  }
  return groups;
}

// Days each student was present (had a time in), and whether they were late that morning or
// came back late from lunch: Map(studentId -> Map(date -> { late, lateLunch }))
function attendance(month) {
  const result = new Map();
  for (const r of db.prepare(`
    SELECT student_id, school_date,
           MAX(result = 'time_in' AND is_late = 1) AS late, MAX(result = 'lunch_in' AND is_late = 1) AS late_lunch
    FROM taps
    WHERE school_date LIKE ? AND student_id IS NOT NULL AND result IN ('time_in', 'lunch_in')
    GROUP BY student_id, school_date
    HAVING MAX(result = 'time_in') = 1
  `).all(`${month}-%`)) {
    if (!result.has(r.student_id)) result.set(r.student_id, new Map());
    result.get(r.student_id).set(r.school_date, { late: Boolean(r.late), lateLunch: Boolean(r.late_lunch) });
  }
  return result;
}

// What goes in a student's cell for a day, and whether it counts as absent / tardy.
function mark(student, date, day, attended, today) {
  if (date > today) return { text: '' };
  if (!day.schoolDay) return { text: day.holiday ? 'H' : '' };
  if (date < addedOn(student)) return { text: '-' };
  const a = attended?.get(date);
  if (!a) return { text: 'x', absent: true };
  const text = [a.late && 'L', a.lateLunch && 'LB'].filter(Boolean).join('/');
  return { text, tardy: Boolean(text) };
}

function sheetName(label, used) {
  let name = label.replace('Grade ', 'G').replace(' - ', ' ').replace(/[[\]:*?/\\]/g, '').slice(0, 31);
  for (let n = 2; used.has(name); n++) name = `${name.slice(0, 28)} ${n}`;
  used.add(name);
  return name;
}

function addSheet(workbook, name, cls, month, days, attended, today) {
  const ws = workbook.addWorksheet(name, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ state: 'frozen', xSplit: 2, ySplit: 6 }],
  });
  const firstDay = 3;
  const absentCol = firstDay + days.length;
  const tardyCol = absentCol + 1;
  const remarksCol = absentCol + 2;
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 34;
  for (let i = 0; i < days.length; i++) ws.getColumn(firstDay + i).width = 4.5;
  ws.getColumn(absentCol).width = 8;
  ws.getColumn(tardyCol).width = 8;
  ws.getColumn(remarksCol).width = 22;

  // Title and school details
  ws.mergeCells(1, 1, 1, remarksCol);
  ws.getCell(1, 1).value = 'Daily Attendance Report of Learners (SF2 format)';
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(1, 1).alignment = { horizontal: 'center' };
  ws.mergeCells(2, 1, 2, remarksCol);
  ws.getCell(2, 1).value = `School: ${config.schoolName}`;
  ws.mergeCells(3, 1, 3, remarksCol);
  ws.getCell(3, 1).value = `Month: ${monthName}    Grade level: ${cls.gradeLevel}    Strand and section: ${cls.strand} ${cls.section}`;

  // Two header rows: day of the month, then the weekday
  const header1 = ws.getRow(5);
  const header2 = ws.getRow(6);
  header1.getCell(1).value = 'No.';
  header1.getCell(2).value = "Learner's name";
  ws.mergeCells(5, 1, 6, 1);
  ws.mergeCells(5, 2, 6, 2);
  days.forEach((d, i) => {
    header1.getCell(firstDay + i).value = Number(d.date.slice(8));
    header2.getCell(firstDay + i).value = ['', 'M', 'T', 'W', 'TH', 'F', ''][new Date(`${d.date}T00:00:00Z`).getUTCDay()];
  });
  for (const [col, text] of [[absentCol, 'Absent'], [tardyCol, 'Tardy'], [remarksCol, 'Remarks']]) {
    header1.getCell(col).value = text;
    ws.mergeCells(5, col, 6, col);
  }
  for (const row of [header1, header2]) {
    for (let c = 1; c <= remarksCol; c++) {
      const cell = row.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
      cell.border = border;
    }
  }
  days.forEach((d, i) => {
    if (!d.schoolDay) for (const row of [header1, header2]) row.getCell(firstDay + i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.holiday } };
  });

  let rowNo = 7;
  let number = 1;
  const totalRow = (label, presentPerDay, absent, tardy) => {
    const row = ws.getRow(rowNo++);
    row.getCell(2).value = label;
    presentPerDay.forEach((n, i) => { row.getCell(firstDay + i).value = n; });
    row.getCell(absentCol).value = absent;
    row.getCell(tardyCol).value = tardy;
    for (let c = 1; c <= remarksCol; c++) {
      row.getCell(c).font = { bold: true };
      row.getCell(c).border = border;
      if (c >= firstDay) row.getCell(c).alignment = { horizontal: 'center' };
    }
  };

  const combined = { present: days.map(() => 0), absent: 0, tardy: 0 };
  for (const [sex, title] of SEX_GROUPS) {
    const group = cls.students.filter((s) => (s.sex ?? null) === sex);
    if (!group.length && sex === null) continue; // only show "not specified" when needed
    const groupRow = ws.getRow(rowNo++);
    groupRow.getCell(2).value = title;
    for (let c = 1; c <= remarksCol; c++) {
      groupRow.getCell(c).font = { bold: true };
      groupRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.group } };
      groupRow.getCell(c).border = border;
    }

    const totals = { present: days.map(() => 0), absent: 0, tardy: 0 };
    for (const student of group) {
      const row = ws.getRow(rowNo++);
      row.getCell(1).value = number++;
      row.getCell(2).value = student.full_name;
      let absent = 0;
      let tardy = 0;
      days.forEach((d, i) => {
        const m = mark(student, d.date, d, attended.get(student.id), today);
        const cell = row.getCell(firstDay + i);
        cell.value = m.text;
        cell.alignment = { horizontal: 'center' };
        if (m.absent) { absent++; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.absent } }; }
        if (m.tardy) { tardy++; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.late } }; }
        if (!d.schoolDay) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.holiday } };
        if (d.schoolDay && d.date <= today && !m.absent && m.text !== '-') totals.present[i]++;
      });
      row.getCell(absentCol).value = absent;
      row.getCell(tardyCol).value = tardy;
      row.getCell(absentCol).alignment = { horizontal: 'center' };
      row.getCell(tardyCol).alignment = { horizontal: 'center' };
      for (let c = 1; c <= remarksCol; c++) row.getCell(c).border = border;
      totals.absent += absent;
      totals.tardy += tardy;
    }
    totalRow(`${title} | TOTAL present per day`, totals.present.map((n, i) => (days[i].schoolDay && days[i].date <= today ? n : '')), totals.absent, totals.tardy);
    totals.present.forEach((n, i) => { combined.present[i] += n; });
    combined.absent += totals.absent;
    combined.tardy += totals.tardy;
  }
  totalRow('COMBINED | TOTAL present per day', combined.present.map((n, i) => (days[i].schoolDay && days[i].date <= today ? n : '')), combined.absent, combined.tardy);

  rowNo++;
  ws.mergeCells(rowNo, 1, rowNo, remarksCol);
  ws.getCell(rowNo, 1).value = 'Legend: blank = present, x = absent, L = late in the morning, LB = came back late from lunch, '
    + 'H = holiday, - = not yet in the system. Generated by Tap-Tap Mo.';
  ws.getCell(rowNo, 1).font = { italic: true, size: 9 };
}

// Builds the workbook. classFilter: { gradeLevel, strand, section } (empty = every section).
async function buildSf2(month, classFilter = {}) {
  const dates = datesOfMonth(month).filter(isWeekday);
  const days = dates.map((date) => ({ date, ...schoolDayInfo(date) }));
  const today = schoolDate();
  const classes = studentsByClass(classFilter, dates.at(-1));
  const attended = attendance(month);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tap-Tap Mo';
  workbook.created = new Date();
  const used = new Set();
  for (const [label, cls] of classes) addSheet(workbook, sheetName(label, used), cls, month, days, attended, today);
  if (!classes.size) workbook.addWorksheet('No students').getCell('A1').value = 'No students match this filter.';
  return workbook.xlsx.writeBuffer();
}

module.exports = { buildSf2 };
