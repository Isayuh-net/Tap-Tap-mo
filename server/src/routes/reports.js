// Attendance reports and export. (US-13)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const todo = require('../middleware/notImplemented');

const router = express.Router();
router.use(requireLogin());

router.get('/daily', todo);    // ?date=YYYY-MM-DD&section=&format=csv
router.get('/monthly', todo);  // ?month=YYYY-MM&section=&format=csv

module.exports = router;
