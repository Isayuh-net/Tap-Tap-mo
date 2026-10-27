// Attendance views for the dashboard. (US-09, US-10)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const reports = require('../services/attendanceReports');
const { schoolDate, isDateString } = require('../utils/time');
const { httpError } = require('../utils/httpError');

const router = express.Router();
router.use(requireLogin());

// Today's counts and taps with their text status. Filters: ?gradeLevel=&strand=&section=&q=
router.get('/today', (req, res) => {
  const { gradeLevel, strand, section, q } = req.query;
  res.json(reports.today({ gradeLevel, strand, section, q }));
});

// Weekly summary (Monday to Friday) for the week containing ?weekOf=YYYY-MM-DD (default this week),
// with the same class filters. Average attendance, tardiness, per-day numbers, and most often late.
router.get('/week', (req, res) => {
  const { weekOf = schoolDate(), gradeLevel, strand, section } = req.query;
  if (!isDateString(weekOf)) throw httpError(400, 'weekOf must look like 2026-10-26.');
  res.json(reports.week(weekOf, { gradeLevel, strand, section }));
});

module.exports = router;
