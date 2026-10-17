// Attendance views for the dashboard. (US-09, US-10)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const todo = require('../middleware/notImplemented');

const router = express.Router();
router.use(requireLogin());

router.get('/today', todo);    // today's taps with text status, ?section=&q=  (teachers: own section only)
router.get('/summary', todo);  // present / late / absent counts for a date

module.exports = router;
