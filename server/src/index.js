// Tap-Tap Mo server entry point. Runs on the school's server PC, on the local network.
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
require('./db'); // opens the database and creates the tables
const smsQueue = require('./services/smsQueue');
const internet = require('./services/internet');
const backup = require('./services/backup');

const app = express();
app.use(express.json({ limit: '5mb' })); // room for a CSV import of a whole school
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

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

// API errors as JSON. Errors with a status (like 400 or 409) show their message on the page;
// anything else is logged here and the page only sees a general message.
app.use('/api', (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
});

app.use(express.static(path.join(__dirname, '..', 'public'))); // staff dashboard

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Tap-Tap Mo server running on port ${config.port} (SMS provider: ${config.sms.provider})`);
  smsQueue.start();
  internet.start();
  backup.start();
});
