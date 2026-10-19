// Staff accounts for the dashboard: admin (everything), staff (registration and SMS fixes),
// teacher (viewing attendance).
const db = require('../db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { httpError } = require('../utils/httpError');

const ROLES = ['admin', 'staff', 'teacher'];
const MIN_PASSWORD_LENGTH = 8;

// What is kept in the login session and sent to pages. Never includes the password hash.
function toSessionUser(user) {
  return { id: user.id, username: user.username, fullName: user.full_name, role: user.role, section: user.section };
}

async function create({ username, fullName, role, password, section = null }) {
  username = String(username ?? '').trim().toLowerCase();
  fullName = String(fullName ?? '').trim();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw httpError(400, 'Username must be 3-30 letters, numbers, dots, dashes or underscores');
  }
  if (!fullName) throw httpError(400, 'Full name is required');
  if (!ROLES.includes(role)) throw httpError(400, `Role must be one of: ${ROLES.join(', ')}`);
  if (String(password ?? '').length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    throw httpError(409, `Username "${username}" is already taken`);
  }
  const passwordHash = await hashPassword(password);
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, section) VALUES (?, ?, ?, ?, ?)
  `).run(username, passwordHash, fullName, role, section);
  return toSessionUser(db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid));
}

// Returns the user if the username and password are right, otherwise null.
async function checkLogin(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1')
    .get(String(username ?? '').trim().toLowerCase());
  if (!user || !(await verifyPassword(password ?? '', user.password_hash))) return null;
  return toSessionUser(user);
}

module.exports = { create, checkLogin, ROLES };
