// Attendance views for the dashboard. (US-09, US-10)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const reports = require('../services/attendanceReports');

const router = express.Router();
router.use(requireLogin());

// Today's counts and taps with their text status. Filters: ?gradeLevel=&strand=&section=&q=
router.get('/today', (req, res) => {
  const { gradeLevel, strand, section, q } = req.query;
  res.json(reports.today({ gradeLevel, strand, section, q }));
});

module.exports = router;
