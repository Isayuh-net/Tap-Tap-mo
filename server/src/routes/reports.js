// Attendance reports and export. (US-13)
// Add &format=csv to download the report as a CSV file that opens in Excel.
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const reports = require('../services/attendanceReports');
const { toCsv } = require('../utils/csvWrite');
const { schoolDate, isDateString } = require('../utils/time');
const { httpError } = require('../utils/httpError');

const router = express.Router();
router.use(requireLogin());

const STUDENT_COLUMNS = [
  { header: 'LRN', value: (r) => r.lrn, text: true },
  { header: 'Name', value: (r) => r.name },
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
    { header: 'Attendance %', value: (r) => r.percent },
  ], report.rows));
});

module.exports = router;
