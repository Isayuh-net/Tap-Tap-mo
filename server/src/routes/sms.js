// SMS log and monitoring. (US-10, US-11, US-12)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const todo = require('../middleware/notImplemented');

const router = express.Router();
router.use(requireLogin());

router.get('/', todo);                                            // log, ?status=queued|failed&date=
router.get('/stats', todo);                                       // sent today, queued, failed, credits left, internet online?
router.post('/:id/retry', requireLogin('admin', 'staff'), todo);  // resend after fixing a number

module.exports = router;
