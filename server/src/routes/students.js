// Student records. (US-09, US-13 data source)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const todo = require('../middleware/notImplemented');

const router = express.Router();
router.use(requireLogin());

router.get('/', todo);                                     // list, ?q=name&section=STEM%20A
router.get('/:id', todo);                                  // one student, with cards and recent taps
router.post('/', requireLogin('admin', 'staff'), todo);    // register a student
router.put('/:id', requireLogin('admin', 'staff'), todo);  // edit details (changing the mobile resets verification)
router.patch('/:id/active', requireLogin('admin'), todo);  // deactivate when a student leaves

module.exports = router;
