// RFID cards: link a card to a student, report lost cards. (US-08)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const todo = require('../middleware/notImplemented');

const router = express.Router();
router.use(requireLogin('admin', 'staff'));

router.get('/:uid', todo);              // who owns this card? (used right after tapping on the register page)
router.post('/', todo);                 // { uid, studentId } link a card; deactivates the student's old card
router.post('/:uid/deactivate', todo);  // mark lost or returned

module.exports = router;
