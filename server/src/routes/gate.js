// API for the Electron gate apps. (US-06, US-07, US-14)
const express = require('express');
const db = require('../db');
const gateAuth = require('../middleware/gateAuth');
const { recordTap } = require('../services/attendance');
const smsQueue = require('../services/smsQueue');

const router = express.Router();
router.use(gateAuth);

const MAX_TAPS_PER_UPLOAD = 500;

// Upload taps. The gate saves every tap locally before sending it, and resends anything
// the server has not confirmed. Every tap gets a result, so the gate can remove it from its outbox.
// Body:  { taps: [{ clientTapId, uid, tappedAt }] }
// Reply: { results: [{ clientTapId, result, name, gradeSection, isLate, smsQueued }] }
router.post('/taps', (req, res) => {
  const taps = req.body?.taps;
  if (!Array.isArray(taps) || taps.length > MAX_TAPS_PER_UPLOAD) {
    return res.status(400).json({ error: `taps must be a list of at most ${MAX_TAPS_PER_UPLOAD}` });
  }

  const valid = taps.filter((t) => typeof t?.clientTapId === 'string' && t.clientTapId
    && typeof t.uid === 'string' && t.uid.trim() && t.uid.length <= 64);
  const invalid = taps.filter((t) => !valid.includes(t));

  // Oldest first, so time in / time out toggles in the order the student actually tapped.
  valid.sort((a, b) => String(a.tappedAt).localeCompare(String(b.tappedAt)));

  const results = valid.map((t) => recordTap({ ...t, gateId: req.gateId }));
  for (const t of invalid) {
    if (typeof t?.clientTapId === 'string') results.push({ clientTapId: t.clientTapId, result: 'rejected' });
  }
  res.json({ results });
  if (results.some((r) => r.smsQueued)) smsQueue.sendSoon();
});

// Active cards and student names, cached by the gate so it can still show
// names when the server cannot be reached.
// Reply: { cards: { [uid]: { name, gradeSection } } }
router.get('/roster', (req, res) => {
  const rows = db.prepare(`
    SELECT c.uid, s.full_name, s.grade_level, s.section
    FROM cards c JOIN students s ON s.id = c.student_id
    WHERE c.status = 'active' AND s.active = 1
  `).all();
  const cards = {};
  for (const r of rows) {
    cards[r.uid] = { name: r.full_name, gradeSection: `Grade ${r.grade_level} - ${r.section}` };
  }
  res.json({ cards });
});

module.exports = router;
