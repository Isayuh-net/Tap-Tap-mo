// Tap-Tap Mo server entry point. Runs on the school's server PC, on the local network.
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
require('./db'); // opens the database and creates the tables
const smsQueue = require('./services/smsQueue');
const internet = require('./services/internet');
const backup = require('./services/backup');
const rateLimit = require('./middleware/rateLimit');

const app = express();
app.disable('x-powered-by');

// Security headers on every response: pages only run the dashboard's own scripts (no injected
// ones), can't be shown inside another site, and don't leak addresses. API replies hold students'
// and parents' data, so browsers don't keep them (a reply can still allow it, like photos).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

// Each computer can make at most 600 dashboard API requests a minute (the dashboard itself makes
// about 25). Gates are left out: they prove who they are with their gate key.
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: 'Too many requests from this computer. Wait a minute and try again.',
  skip: (req) => req.path.startsWith('/gate/') || req.path === '/health',
}));

app.use(express.json({ limit: '5mb' })); // room for a CSV import of a whole school
app.use(session({
  name: 'tapmo.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  // A login ends after 12 hours without using the dashboard (each request starts the 12 hours again).
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000 },
}));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// The dashboard's fonts come from npm packages, so they load without internet.
app.use('/fonts/text', express.static(path.dirname(require.resolve('@fontsource-variable/atkinson-hyperlegible-next'))));
app.use('/fonts/mono', express.static(path.dirname(require.resolve('@fontsource-variable/atkinson-hyperlegible-mono'))));

app.use('/api/gate', require('./routes/gate'));            // Electron gate apps
app.use('/api/auth', require('./routes/auth'));            // staff login
app.use('/api/students', require('./routes/students'));
app.use('/api/cards', require('./routes/cards'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/backups', require('./routes/backups'));
app.use('/api/settings', require('./routes/settings'));    // Lunch and SMS settings
app.use('/api/templates', require('./routes/templates'));  // school templates (Reports and files)

// API errors as JSON. Errors with a status (like 400 or 409) show their message on the page;
// anything else is logged here and the page only sees a general message.
app.use('/api', (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
});

app.use(express.static(path.join(__dirname, '..', 'public'))); // staff dashboard

// Anything else that goes wrong gets a plain message: error details and file paths stay in the
// server window, never on the page.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).type('text').send(status === 404 ? 'Not found' : 'Something went wrong');
});

// Settings in .env that are still the examples' placeholders, which anyone can read on GitHub.
function warnAboutWeakSecrets() {
  const weak = [];
  if (config.sessionSecret.length < 32 || /change|secret|dev-only/i.test(config.sessionSecret)) weak.push('SESSION_SECRET');
  if (Object.values(config.gateKeys).some((key) => key.length < 20 || /change-me/.test(key))) weak.push('GATE_KEYS');
  if (!/^[0-9a-f]{64}$/i.test(config.secretsKey)) weak.push('SECRETS_KEY');
  if (weak.length) {
    console.warn(`WARNING: ${weak.join(', ')} in server/.env ${weak.length === 1 ? 'is' : 'are'} missing or still a placeholder. `
      + 'See "Keeping secrets safe" in README.md.');
  }
}

app.listen(config.port, '0.0.0.0', () => {
  warnAboutWeakSecrets();
  console.log(`Tap-Tap Mo server running on port ${config.port} (SMS provider: ${require('./services/sms').name})`);
  smsQueue.start();
  internet.start();
  backup.start();
});
