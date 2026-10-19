// Parent mobile number verification at registration. (US-05)
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const verification = require('../services/verification');

const router = express.Router();
router.use(requireLogin('admin', 'staff'));

// { studentId } -> texts a 6-digit code to the parent. Reply: { sentTo, expiresInMinutes }
router.post('/send', (req, res) => {
  res.json(verification.sendCode(Number(req.body?.studentId)));
});

// { studentId, code } -> marks the number as verified. Reply: { verified: true, mobile }
router.post('/confirm', (req, res) => {
  res.json(verification.confirmCode(Number(req.body?.studentId), req.body?.code));
});

module.exports = router;
