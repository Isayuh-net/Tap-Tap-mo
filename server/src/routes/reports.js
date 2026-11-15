// Attendance reports and export. (US-13)
// Add &format=csv to download the report as a CSV file that opens in Excel.
const path = require('node:path');
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const reports = require('../services/attendanceReports');
const reportFiles = require('../services/reportFiles');
const { toCsv } = require('../utils/csvWrite');
const { buildSf2 } = require('../services/sf2');
const { attendanceFile } = require('../services/excelExports');
const { schoolDate, isDateString } = require('../utils/time');
const { httpError } = require('../utils/httpError');

const router = express.Router();
router.use(requireLogin());

const STUDENT_COLUMNS = [
  { header: 'LRN', value: (r) => r.lrn, text: true },
  { header: 'School ID', value: (r) => r.schoolId, text: true },
  { header: 'Name', value: (r) => r.name },
  { header: 'Sex', value: (r) => r.sex },
  { header: 'Grade', value: (r) => r.gradeLevel },
  { header: 'Strand', value: (r) => r.strand },
  { header: 'Section', value: (r) => r.section },
];

function classFilter(query) {
  const { gradeLevel, strand, section } = query;
  return { gradeLevel, strand, section };
}

// "attendance-daily-2026-10-19-grade-11-stem-a.csv"
function fileName(kind, period, { gradeLevel, strand, section }) {
  const cls = gradeLevel ? `-grade-${gradeLevel}-${strand}-${section}` : '';
  return `attendance-${kind}-${period}${cls}.csv`.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
}

function sendCsv(res, name, csv) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send(csv);
}

// ?date=YYYY-MM-DD (default today) &gradeLevel=&strand=&section= &format=csv
router.get('/daily', (req, res) => {
  const date = req.query.date || schoolDate();
  if (!isDateString(date)) throw httpError(400, 'Date must look like 2026-10-19.');
  const report = reports.daily(date, classFilter(req.query));
  if (req.query.format !== 'csv') return res.json(report);
  sendCsv(res, fileName('daily', date, req.query), toCsv([
    ...STUDENT_COLUMNS,
    { header: 'Time in', value: (r) => r.timeIn },
    { header: 'Time out', value: (r) => r.timeOut },
    { header: 'Status', value: (r) => r.status },
    { header: 'Notes', value: (r) => r.notes },
  ], report.rows));
});

// ?month=YYYY-MM (default this month) &gradeLevel=&strand=&section= &format=csv
router.get('/monthly', (req, res) => {
  const month = req.query.month || schoolDate().slice(0, 7);
  if (!isDateString(`${month}-01`)) throw httpError(400, 'Month must look like 2026-10.');
  const report = reports.monthly(month, classFilter(req.query));
  if (req.query.format !== 'csv') return res.json(report);
  sendCsv(res, fileName('monthly', month, req.query), toCsv([
    ...STUDENT_COLUMNS,
    { header: 'School days', value: (r) => r.schoolDays },
    { header: 'Present', value: (r) => r.present },
    { header: 'Late', value: (r) => r.late },
    { header: 'Absent', value: (r) => r.absent },
    { header: 'Late from lunch', value: (r) => r.lateFromLunch },
    { header: 'Left early', value: (r) => r.leftEarly },
    { header: 'Attendance %', value: (r) => r.percent },
  ], report.rows));
});

// "Grade 11 - STEM A, November 2026.xlsx" as a download, with a plain-letters name for old browsers
function sendXlsx(res, fileName, buffer) {
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${fileName.replace(/[^\w ,.()-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.send(Buffer.from(buffer));
}

// Attendance as Excel for Reports and files, also saved in the reports folder.
// ?period=daily&date=YYYY-MM-DD or ?period=monthly&month=YYYY-MM, &gradeLevel=&strand=&section=,
// &separate=1 for a Male and a Female sheet per section
router.get('/excel', async (req, res) => {
  const period = req.query.period === 'daily' ? 'daily' : 'monthly';
  const date = req.query.date || schoolDate();
  const month = req.query.month || schoolDate().slice(0, 7);
  if (period === 'daily' && !isDateString(date)) throw httpError(400, 'Date must look like 2026-10-19.');
  if (period === 'monthly' && !isDateString(`${month}-01`)) throw httpError(400, 'Month must look like 2026-10.');
  const file = await attendanceFile({ period, date, month, filter: classFilter(req.query), separate: req.query.separate === '1' });
  try {
    res.set('X-Saved-To', encodeURIComponent(reportFiles.save(file, file.buffer)));
  } catch (err) {
    // The download still works; the page says the copy wasn't saved.
    console.warn(`Report not saved in the reports folder: ${err.message}`);
  }
  sendXlsx(res, file.fileName, file.buffer);
});

// The saved files, by school year and section. Reply: { folder, years: [...] }
router.get('/files', (req, res) => res.json(reportFiles.list()));

// One saved file. ?path=School year 2026-2027/Grade 11 - STEM A/<file>.xlsx
router.get('/files/open', (req, res) => {
  const file = reportFiles.resolve(req.query.path);
  res.download(file, path.basename(file));
});

// Body: { folder: 'C:\\Tap-Tap Mo\\Reports' }
router.put('/folder', requireLogin('admin'), (req, res) => res.json(reportFiles.setFolder(req.body?.folder)));

// Monthly attendance as an Excel file in the SF2 layout: one sheet per section, boys then girls.
// ?month=YYYY-MM (default this month) &gradeLevel=&strand=&section= (default every section)
router.get('/sf2', async (req, res) => {
  const month = req.query.month || schoolDate().slice(0, 7);
  if (!isDateString(`${month}-01`)) throw httpError(400, 'Month must look like 2026-10.');
  const buffer = await buildSf2(month, classFilter(req.query));
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${fileName('sf2', month, req.query).replace(/\.csv$/, '.xlsx')}"`);
  res.send(Buffer.from(buffer));
});

module.exports = router;
