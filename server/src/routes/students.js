// Student records. (US-05, US-09, US-13 data source)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const todo = require('../middleware/notImplemented');
const students = require('../services/students');
const { importStudents } = require('../services/studentImport');
const { STRANDS } = require('../utils/strands');

const router = express.Router();
router.use(requireLogin());

router.get('/strands', (req, res) => res.json({ strands: STRANDS }));  // for the strand dropdown

// Every class with how many students still need a card. Reply: { classes: [...] }
router.get('/classes', (req, res) => res.json({ classes: students.classes() }));

// Active students. Filters: ?gradeLevel=11&strand=STEM&section=A&q=part+of+name
router.get('/', (req, res) => {
  const { gradeLevel, strand, section, q } = req.query;
  res.json({ students: students.list({ gradeLevel, strand, section, q }) });
});

router.get('/:id', todo);                                  // one student, with cards and recent taps

// Register a student with their card. Body: { uid, fullName, gradeLevel, strand, section, guardianName, guardianMobile }
router.post('/', requireLogin('admin', 'staff'), (req, res) => {
  res.status(201).json(students.create(req.body ?? {}));
});

// Import many students from CSV text. Body: { csv, commit }. commit false = preview only.
router.post('/import', requireLogin('admin', 'staff'), (req, res) => {
  res.json(importStudents(req.body?.csv, { commit: req.body?.commit === true }));
});

// Edit details (same body without uid). Changing the mobile number resets verification.
router.put('/:id', requireLogin('admin', 'staff'), (req, res) => {
  res.json(students.update(Number(req.params.id), req.body ?? {}));
});

// Correct a parent's number. Body: { guardianMobile }. A changed number must be verified again.
router.patch('/:id/mobile', requireLogin('admin', 'staff'), (req, res) => {
  res.json(students.changeMobile(Number(req.params.id), req.body?.guardianMobile));
});

router.patch('/:id/active', requireLogin('admin'), todo);  // deactivate when a student leaves

module.exports = router;
