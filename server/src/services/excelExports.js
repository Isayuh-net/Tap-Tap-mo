// Excel downloads: attendance for Reports and files, and a section's student list for the
// Students page. With "separate male and female", each section gets a Male and a Female sheet.
//   Monthly attendance: the SF2 layout (sf2.js), one column per school day.
//   Daily attendance:   one row per student with time in, time out, status and notes.
//   Student list:       name, LRN, ID number, card numbers and parent's number.
const config = require('../config');
const reports = require('./attendanceReports');
const students = require('./students');
const { buildSf2, newWorkbook, sheetName, separateGroups, groupSheetLabel, SEX_GROUPS, COLORS, border } = require('./sf2');
const { classLabel } = require('../utils/classLabel');

const SEX_LABELS = { M: 'Male', F: 'Female' };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// "Grade 11 - STEM A" for a chosen section, "All sections" otherwise
function filterLabel({ gradeLevel, strand, section }) {
  return gradeLevel ? classLabel({ grade_level: Number(gradeLevel), strand, section }) : 'All sections';
}

const longDate = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const longMonth = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Groups rows (which have classLabel and sex) by section, keeping their order.
function bySection(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.classLabel)) groups.set(row.classLabel, []);
    groups.get(row.classLabel).push(row);
  }
  return groups;
}

// A simple list sheet: title rows, a header row, then the rows of each sex with a group title.
// columns: [{ header, width, value(row) }]; rowStyle(row, cell, column) can color a cell.
function addListSheet(workbook, name, { title, details, columns, groups, footer, rowStyle }) {
  const ws = workbook.addWorksheet(name, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  const last = columns.length + 1;
  ws.getColumn(1).width = 5;
  columns.forEach((c, i) => { ws.getColumn(i + 2).width = c.width; });

  ws.mergeCells(1, 1, 1, last);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, last);
  ws.getCell(2, 1).value = `School: ${config.schoolName}`;
  ws.mergeCells(3, 1, 3, last);
  ws.getCell(3, 1).value = details;

  const header = ws.getRow(5);
  ['No.', ...columns.map((c) => c.header)].forEach((text, i) => {
    const cell = header.getCell(i + 1);
    cell.value = text;
    cell.font = { bold: true };
    cell.fill = fill(COLORS.header);
    cell.border = border;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  let rowNo = 6;
  for (const { title: groupTitle, rows, summary } of groups) {
    const groupRow = ws.getRow(rowNo++);
    groupRow.getCell(2).value = `${groupTitle} (${rows.length})`;
    for (let c = 1; c <= last; c++) {
      groupRow.getCell(c).font = { bold: true };
      groupRow.getCell(c).fill = fill(COLORS.group);
      groupRow.getCell(c).border = border;
    }
    rows.forEach((r, i) => {
      const row = ws.getRow(rowNo++);
      row.getCell(1).value = i + 1;
      columns.forEach((column, c) => {
        const cell = row.getCell(c + 2);
        cell.value = column.value(r) ?? '';
        rowStyle?.(r, cell, column);
      });
      for (let c = 1; c <= last; c++) row.getCell(c).border = border;
    });
    if (summary) {
      const row = ws.getRow(rowNo++);
      row.getCell(2).value = summary;
      row.getCell(2).font = { italic: true };
    }
  }
  if (footer) {
    rowNo++;
    ws.mergeCells(rowNo, 1, rowNo, last);
    ws.getCell(rowNo, 1).value = footer;
    ws.getCell(rowNo, 1).font = { italic: true, size: 9 };
  }
}

// The sex groups of a section's rows: all of them on one sheet, or one sheet each.
function sheetsFor(label, rows, separate, oneSection) {
  const groupOf = ([sex, title]) => ({ title, rows: rows.filter((r) => (r.sex ?? null) === sex) });
  if (!separate) {
    const groups = SEX_GROUPS.map(groupOf).filter((g) => g.rows.length || g.title !== 'NOT SPECIFIED');
    return [{ name: label, groups }];
  }
  return separateGroups(rows).map((group) => ({ name: groupSheetLabel(label, group[1], oneSection), groups: [groupOf(group)] }));
}

const DAILY_COLUMNS = [
  { header: "Learner's name", width: 32, value: (r) => r.name },
  { header: 'Sex', width: 7, value: (r) => r.sex },
  { header: 'LRN', width: 16, value: (r) => r.lrn },
  { header: 'ID number', width: 14, value: (r) => r.schoolId },
  { header: 'Time in', width: 11, value: (r) => r.timeIn },
  { header: 'Time out', width: 11, value: (r) => r.timeOut },
  { header: 'Status', width: 11, value: (r) => r.status },
  { header: 'Notes', width: 42, value: (r) => r.notes },
];

async function buildDaily(date, filter, separate) {
  const report = reports.daily(date, filter);
  const sections = bySection(report.rows);
  const workbook = newWorkbook();
  const used = new Set();
  const dayName = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  for (const [label, rows] of sections) {
    const [grade, strandSection] = [rows[0].gradeLevel, `${rows[0].strand} ${rows[0].section}`.trim()];
    for (const sheet of sheetsFor(label, rows, separate, sections.size === 1)) {
      const learners = sheet.groups.length === 1 ? `    Learners: ${sheet.groups[0].title.toLowerCase()}` : '';
      addListSheet(workbook, sheetName(sheet.name, used), {
        title: 'Daily Attendance of Learners',
        details: `Date: ${dayName}, ${longDate(date)}    Grade level: ${grade}    Strand and section: ${strandSection}${learners}`,
        columns: DAILY_COLUMNS,
        groups: sheet.groups.map((g) => {
          const count = (status) => g.rows.filter((r) => r.status === status).length;
          return {
            ...g,
            summary: report.schoolDay
              ? `${count('Present') + count('Late')} present (${count('Late')} late), ${count('Absent')} absent`
              : null,
          };
        }),
        footer: report.schoolDay
          ? 'Late = arrived after classes started. Generated by Tap-Tap Mo.'
          : `No classes on this day (${report.holiday ?? 'weekend'}). Taps are still listed. Generated by Tap-Tap Mo.`,
        rowStyle: (r, cell, column) => {
          if (column.header !== 'Status') return;
          if (r.status === 'Absent') cell.fill = fill(COLORS.absent);
          if (r.status === 'Late') cell.fill = fill(COLORS.late);
        },
      });
    }
  }
  if (!sections.size) workbook.addWorksheet('No students').getCell('A1').value = 'No students match this filter.';
  return workbook.xlsx.writeBuffer();
}

// The attendance file for Reports and files.
// { period: 'daily' | 'monthly', date, month, filter: { gradeLevel, strand, section }, separate }
// -> { buffer, fileName, label, schoolYearDate }
async function attendanceFile({ period, date, month, filter, separate }) {
  const label = filterLabel(filter);
  const together = separate ? '' : ' (male and female)';
  if (period === 'daily') {
    return {
      buffer: await buildDaily(date, filter, separate),
      fileName: `${label}, Daily, ${longDate(date)}${together}.xlsx`,
      label,
      schoolYearDate: date,
    };
  }
  return {
    buffer: await buildSf2(month, filter, { separate }),
    fileName: `${label}, ${longMonth(month)}${together}.xlsx`,
    label,
    schoolYearDate: `${month}-01`,
  };
}

const LIST_COLUMNS = [
  { header: "Learner's name", width: 32, value: (r) => r.fullName },
  { header: 'Sex', width: 7, value: (r) => SEX_LABELS[r.sex] ?? '' },
  { header: 'LRN', width: 16, value: (r) => r.lrn },
  { header: 'ID number', width: 14, value: (r) => r.schoolId },
  { header: 'Card no.', width: 10, value: (r) => r.cardNo },
  { header: 'RFID card number', width: 16, value: (r) => r.cardUid },
  { header: 'Parent or guardian', width: 26, value: (r) => r.guardianName },
  { header: 'Parent mobile', width: 15, value: (r) => r.guardianMobile },
  { header: 'Number verified', width: 10, value: (r) => (r.guardianMobile ? (r.mobileVerified ? 'Yes' : 'No') : '') },
];

// A section's students (or everyone) with Male and Female sheets, for the Students page.
async function studentListFile(filter) {
  const label = filterLabel(filter);
  const rows = students.list(filter).sort((a, b) => a.classLabel.localeCompare(b.classLabel, 'en', { numeric: true })
    || a.fullName.localeCompare(b.fullName));
  const sections = bySection(rows);
  const workbook = newWorkbook();
  const used = new Set();
  for (const [section, list] of sections) {
    for (const sheet of sheetsFor(section, list, true, sections.size === 1)) {
      addListSheet(workbook, sheetName(sheet.name, used), {
        title: 'List of Learners',
        details: `Section: ${section}${sheet.groups.length === 1 ? `    Learners: ${sheet.groups[0].title.toLowerCase()}` : ''}`,
        columns: LIST_COLUMNS,
        groups: sheet.groups,
        footer: 'Personal data of learners and parents (Data Privacy Act). Keep this file private. Generated by Tap-Tap Mo.',
      });
    }
  }
  if (!sections.size) workbook.addWorksheet('No students').getCell('A1').value = 'No students match this filter.';
  return { buffer: await workbook.xlsx.writeBuffer(), fileName: `${label}, student list.xlsx` };
}

module.exports = { attendanceFile, studentListFile, filterLabel };
