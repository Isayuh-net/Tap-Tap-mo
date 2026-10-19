// SMS log and monitoring. (US-10, US-11, US-12)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const smsLog = require('../services/smsLog');
const { isDateString } = require('../utils/time');
const { httpError } = require('../utils/httpError');

const router = express.Router();
router.use(requireLogin());

// Dashboard numbers (everyone): today's texts, waiting queue, credits left, internet status.
router.get('/stats', async (req, res) => {
  res.json(await smsLog.stats());
});

// The log (admin and staff, since it shows full phone numbers).
// ?status=attention|failed|queued|sent|all&date=YYYY-MM-DD
router.get('/', requireLogin('admin', 'staff'), (req, res) => {
  const { status, date } = req.query;
  if (date && !isDateString(date)) throw httpError(400, 'Date must look like 2026-10-19.');
  res.json({ texts: smsLog.list({ status, date }) });
});

// Send a failed or waiting attendance text again (to the parent's current verified number).
router.post('/:id/retry', requireLogin('admin', 'staff'), (req, res) => {
  res.json(smsLog.retry(Number(req.params.id)));
});

module.exports = router;
