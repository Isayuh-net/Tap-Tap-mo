// Student records. (US-05, US-09, US-13 data source)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const todo = require('../middleware/notImplemented');
const students = require('../services/students');
const { STRANDS } = require('../utils/strands');

const router = express.Router();
router.use(requireLogin());

router.get('/strands', (req, res) => res.json({ strands: STRANDS }));  // for the strand dropdown

router.get('/', todo);                                     // list, ?q=name&section=A
router.get('/:id', todo);                                  // one student, with cards and recent taps

// Register a student with their card. Body: { uid, fullName, gradeLevel, strand, section, guardianName, guardianMobile }
router.post('/', requireLogin('admin', 'staff'), (req, res) => {
  res.status(201).json(students.create(req.body ?? {}));
});

// Edit details (same body without uid). Changing the mobile number resets verification.
router.put('/:id', requireLogin('admin', 'staff'), (req, res) => {
  res.json(students.update(Number(req.params.id), req.body ?? {}));
});

router.patch('/:id/active', requireLogin('admin'), todo);  // deactivate when a student leaves

module.exports = router;
