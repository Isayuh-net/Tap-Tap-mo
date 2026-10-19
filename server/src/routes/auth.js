// Staff login for the dashboard.
const express = require('express');
const users = require('../services/users');

const router = express.Router();

// { username, password } -> { user }
router.post('/login', async (req, res) => {
  const user = await users.checkLogin(req.body?.username, req.body?.password);
  if (!user) return res.status(401).json({ error: 'Wrong username or password' });
  // New session id on login, so an old cookie can't be reused to take over the account.
  await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  req.session.user = user;
  res.json({ user });
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => (err ? next(err) : res.json({ ok: true })));
});

// Who is logged in. Pages call this first and go to the login page on 401.
router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  res.json({ user: req.session.user });
});

module.exports = router;
