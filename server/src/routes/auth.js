// Staff login for the dashboard.
const express = require('express');
const users = require('../services/users');

const router = express.Router();

// After 5 wrong passwords for a username, that username is locked for 15 minutes,
// so nobody can guess passwords by trying thousands of them.
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const failures = new Map(); // username -> { count, lockedUntil }

function lockMessage(username) {
  const entry = failures.get(username);
  if (!entry?.lockedUntil) return null;
  const minutesLeft = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
  if (minutesLeft <= 0) {
    failures.delete(username);
    return null;
  }
  return `Too many wrong passwords. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`;
}

function recordFailure(username) {
  const entry = failures.get(username) ?? { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = Date.now() + LOCK_MINUTES * 60 * 1000;
  failures.set(username, entry);
}

// { username, password } -> { user }
router.post('/login', async (req, res) => {
  const username = String(req.body?.username ?? '').trim().toLowerCase();
  const locked = lockMessage(username);
  if (locked) return res.status(429).json({ error: locked });

  const user = await users.checkLogin(username, req.body?.password);
  if (!user) {
    recordFailure(username);
    return res.status(401).json({ error: lockMessage(username) ?? 'Wrong username or password' });
  }
  failures.delete(username);
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
