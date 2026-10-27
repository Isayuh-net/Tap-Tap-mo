// API for the Electron gate apps. (US-06, US-07, US-14)
const express = require('express');
const db = require('../db');
const config = require('../config');
const gateAuth = require('../middleware/gateAuth');
const { recordTap } = require('../services/attendance');
const smsQueue = require('../services/smsQueue');
const { classLabel } = require('../utils/classLabel');
const { displayTime } = require('../utils/time');

const router = express.Router();
router.use(gateAuth);

const MAX_TAPS_PER_UPLOAD = 500;

const RESULT_LABELS = {
  time_in: 'TIME IN',
  lunch_out: 'LUNCH OUT',
  lunch_in: 'BACK FROM LUNCH',
  time_out: 'TIME OUT',
  early_out: 'EARLY OUT',
  cooldown: 'ALREADY TAPPED',
  unregistered: 'NOT REGISTERED',
  inactive: 'DEACTIVATED',
};

// One line per tap in the server window, e.g.
// "[gate1]  7:12 AM  TIME IN         Test Student, Grade 12 - STEM A - text queued"
function logTap(gateId, tap, reply) {
  const date = new Date(tap.tappedAt);
  const time = Number.isNaN(date.getTime()) ? '' : displayTime(date);
  const who = reply.name ? `${reply.name}, ${reply.gradeSection}` : `${reply.method === 'lrn' ? 'LRN' : 'card'} ${tap.uid}`;
  const lrn = reply.method === 'lrn' && reply.name ? ' [typed LRN]' : '';
  const late = reply.isLate ? ' (LATE)' : '';
  const sms = reply.smsQueued ? ' - text queued' : '';
  console.log(`[${gateId}] ${time.padStart(8)}  ${RESULT_LABELS[reply.result].padEnd(14)}  ${who}${late}${lrn}${sms}`);
}

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

  const results = valid.map((t) => {
    const reply = recordTap({ ...t, gateId: req.gateId });
    logTap(req.gateId, t, reply);
    return reply;
  });
  for (const t of invalid) {
    if (typeof t?.clientTapId === 'string') results.push({ clientTapId: t.clientTapId, result: 'rejected' });
  }
  res.json({ results });
  if (results.some((r) => r.smsQueued)) smsQueue.sendSoon();
});

// Active cards and student names, cached by the gate so it can still show
// names when the server cannot be reached. LRNs are included for students who type theirs.
// Reply: { cards: { [uid]: { name, gradeSection } }, lrns: { [lrn]: { name, gradeSection } } }
router.get('/roster', (req, res) => {
  const rows = db.prepare(`
    SELECT c.uid, s.full_name, s.grade_level, s.strand, s.section
    FROM cards c JOIN students s ON s.id = c.student_id
    WHERE c.status = 'active' AND s.active = 1
  `).all();
  const cards = {};
  for (const r of rows) {
    cards[r.uid] = { name: r.full_name, gradeSection: classLabel(r) };
  }
  const lrns = {};
  if (config.allowLrnEntry) {
    for (const r of db.prepare('SELECT lrn, full_name, grade_level, strand, section FROM students WHERE active = 1 AND lrn IS NOT NULL').all()) {
      lrns[r.lrn] = { name: r.full_name, gradeSection: classLabel(r) };
    }
  }
  res.json({ cards, lrns });
});

module.exports = router;
