// Days with no classes, so students aren't marked absent. Everyone can see them; admins edit them.
const express = require('express');
const db = require('../db');
const requireLogin = require('../middleware/requireLogin');
const { isDateString } = require('../utils/time');
const { httpError } = require('../utils/httpError');

const router = express.Router();
router.use(requireLogin());

// ?year=2026 -> { holidays: [{ date, name }] }
router.get('/', (req, res) => {
  const year = /^\d{4}$/.test(req.query.year ?? '') ? req.query.year : String(new Date().getFullYear());
  res.json({ holidays: db.prepare('SELECT date, name FROM holidays WHERE date LIKE ? ORDER BY date').all(`${year}-%`) });
});

// { date, name } adds or renames a holiday
router.post('/', requireLogin('admin'), (req, res) => {
  const date = String(req.body?.date ?? '');
  const name = String(req.body?.name ?? '').trim();
  if (!isDateString(date)) throw httpError(400, 'Choose a date.');
  if (!name || name.length > 100) throw httpError(400, 'Enter the holiday\'s name.');
  db.prepare('INSERT INTO holidays (date, name) VALUES (?, ?) ON CONFLICT (date) DO UPDATE SET name = excluded.name').run(date, name);
  res.status(201).json({ date, name });
});

router.delete('/:date', requireLogin('admin'), (req, res) => {
  const { changes } = db.prepare('DELETE FROM holidays WHERE date = ?').run(req.params.date);
  if (!changes) throw httpError(404, 'Holiday not found.');
  res.json({ removed: req.params.date });
});

module.exports = router;
