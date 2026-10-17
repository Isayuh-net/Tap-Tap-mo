// Parent mobile number verification at registration. (US-05)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const todo = require('../middleware/notImplemented');

const router = express.Router();
router.use(requireLogin('admin', 'staff'));

router.post('/send', todo);     // { studentId } text a 6-digit code to the parent
router.post('/confirm', todo);  // { studentId, code } mark the number as verified

module.exports = router;
