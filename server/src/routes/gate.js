// API for the Electron gate apps. (US-06, US-07, US-14)
const express = require('express');
const gateAuth = require('../middleware/gateAuth');
const todo = require('../middleware/notImplemented');

const router = express.Router();
router.use(gateAuth);

// Upload taps, oldest first. The gate saves every tap locally before sending it,
// and resends anything the server has not confirmed.
// Body:  { taps: [{ clientTapId, uid, tappedAt }] }
// Reply: { results: [{ clientTapId, result, name, gradeSection, isLate }] }
router.post('/taps', todo);

// Active cards and student names, cached by the gate so it can still show
// names when the server cannot be reached.
router.get('/roster', todo);

module.exports = router;
