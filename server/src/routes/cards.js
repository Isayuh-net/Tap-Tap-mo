// RFID cards: link a card to a student, report lost cards. (US-08)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const todo = require('../middleware/notImplemented');
const students = require('../services/students');

const router = express.Router();
router.use(requireLogin('admin', 'staff'));

// Who owns this card? Used right after tapping a card on the registration page.
// Reply: { registered: false } or { registered: true, cardStatus, student }
router.get('/:uid', (req, res) => {
  const found = students.findByCard(req.params.uid);
  res.json(found ? { registered: true, ...found } : { registered: false });
});

// Link a card to a student who has no card yet. Body: { uid, studentId }. Reply: the student.
router.post('/', (req, res) => {
  res.status(201).json(students.assignCard(req.body?.uid, Number(req.body?.studentId)));
});

// Undo a card linked by mistake (only before it has been used at the gate).
router.delete('/:uid', (req, res) => {
  res.json(students.removeUnusedCard(req.params.uid));
});

router.post('/:uid/deactivate', todo);  // mark lost or returned

module.exports = router;
