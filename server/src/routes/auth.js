// Staff login for the dashboard.
const express = require('express');
const todo = require('../middleware/notImplemented');

const router = express.Router();

router.post('/login', todo);   // { username, password }
router.post('/logout', todo);
router.get('/me', todo);       // who is logged in

module.exports = router;
