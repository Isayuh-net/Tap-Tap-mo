// Parent mobile number verification. (US-05)
// Sending texts costs SMS credits, so only admin and staff can send. Anyone logged in, including
// advisers (teacher role), can see a class's status and enter the codes students bring in.
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const verification = require('../services/verification');

const router = express.Router();
router.use(requireLogin());

// { studentId, forClass } -> texts a code to one parent. forClass: true = 3-day code.
// Reply: { sentTo, expiresInMinutes, testMode }
router.post('/send', requireLogin('admin', 'staff'), (req, res) => {
  res.json(verification.sendCode(Number(req.body?.studentId), { forClass: req.body?.forClass === true }));
});

// { gradeLevel, strand, section } -> texts codes to every unverified parent in the class.
// Reply: { sent, alreadyVerified, alreadyHaveCode, noNumber, testMode }
router.post('/send-class', requireLogin('admin', 'staff'), (req, res) => {
  res.json(verification.sendCodesForClass(req.body ?? {}));
});

// ?gradeLevel=11&strand=STEM&section=A -> { students: [... with mobileVerified and pendingCode] }
router.get('/class', (req, res) => {
  res.json({ students: verification.classStatus(req.query) });
});

// { studentId, code } -> marks the number as verified. Reply: { verified: true, mobile }
router.post('/confirm', (req, res) => {
  res.json(verification.confirmCode(Number(req.body?.studentId), req.body?.code));
});

module.exports = router;
