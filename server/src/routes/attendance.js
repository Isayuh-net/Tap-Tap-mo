// Attendance views for the dashboard (US-09, US-10), Log by LRN, and the attendance records API.
const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const requireLogin = require('../middleware/requireLogin');
const reports = require('../services/attendanceReports');
const smsQueue = require('../services/smsQueue');
const { recordTap } = require('../services/attendance');
const { classLabel } = require('../utils/classLabel');
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

// Log by LRN: staff type the LRN of a student without their card, and it counts like a tap
// at the "office" gate (texts the parent the same way). Body: { lrn }
router.post('/lrn', requireLogin('admin', 'staff'), (req, res) => {
  const lrn = String(req.body?.lrn ?? '').replace(/\s/g, '');
  if (!/^\d{12}$/.test(lrn)) throw httpError(400, 'An LRN has 12 digits.');
  const student = db.prepare('SELECT * FROM students WHERE lrn = ? AND active = 1').get(lrn);
  if (!student) throw httpError(404, `No student has the LRN ${lrn}. Check the number, or add it on Register card.`);

  const reply = recordTap({
    clientTapId: `office-${crypto.randomUUID()}`,
    uid: lrn,
    gateId: 'office',
    tappedAt: new Date().toISOString(),
    byLrn: true,
  });
  if (reply.smsQueued) smsQueue.sendSoon();
  // The server window shows only the LRN's last 4 digits (logs never hold full LRNs or numbers).
  console.log(`[office] LRN ...${lrn.slice(-4)} ${student.full_name} -> ${reply.result} (by ${req.user.username})`);
  res.json({
    ...reply,
    lrn,
    classLabel: classLabel(student),
    loggedAs: reply.result === 'cooldown' ? null : reports.loggedAs(reply.result, reply.isLate),
  });
});

// Everyone logged by LRN today. Reply: { entries: [{ time, name, lrn, classLabel, loggedAs, where }] }
router.get('/lrn-today', (req, res) => res.json({ entries: reports.lrnToday() }));

// The attendance records API: every time in and out on ?date=YYYY-MM-DD (default today), each
// naming the student by their school ID number:
// { date, records: [{ id_number, lrn, name, section, type, late, method, tapped_at }] }
router.get('/records', (req, res) => {
  const date = req.query.date || schoolDate();
  if (!isDateString(date)) throw httpError(400, 'Date must look like 2026-11-13.');
  res.json({ date, records: reports.records(date) });
});

module.exports = router;
