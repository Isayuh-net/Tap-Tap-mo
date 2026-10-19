// Parent mobile number verification at registration. (US-05, Figure 6)
//  - sendCode(studentId): texts a 6-digit code to the parent's number. Only a hash of the code is saved.
//  - confirmCode(studentId, code): marks the number verified if the code is right.
// A code expires after 10 minutes, 5 wrong tries cancel it, and a new code can be sent after
// 60 seconds. Only verified numbers get attendance texts.
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const messages = require('./messages');
const smsQueue = require('./smsQueue');
const { httpError } = require('../utils/httpError');

const CODE_VALID_MINUTES = 10;
const MAX_WRONG_TRIES = 5;
const RESEND_AFTER_SECONDS = 60;

const findStudent = db.prepare('SELECT * FROM students WHERE id = ?');
const latestCode = db.prepare(`
  SELECT * FROM verification_codes WHERE student_id = ? AND verified_at IS NULL ORDER BY id DESC LIMIT 1
`);

// Tied to the student and signed with the server secret, so the saved hash can't be used to guess codes.
function hashCode(studentId, code) {
  return crypto.createHmac('sha256', config.sessionSecret).update(`${studentId}:${code}`).digest('hex');
}

function sendCode(studentId) {
  const student = findStudent.get(studentId);
  if (!student) throw httpError(404, 'Student not found.');
  if (!student.guardian_mobile) throw httpError(400, 'This student has no parent mobile number.');
  if (student.mobile_verified_at) throw httpError(409, 'This parent\'s number is already verified.');

  const last = latestCode.get(studentId);
  if (last) {
    const sentAt = Date.parse(last.expires_at) - CODE_VALID_MINUTES * 60 * 1000;
    const waitSeconds = Math.ceil(RESEND_AFTER_SECONDS - (Date.now() - sentAt) / 1000);
    if (waitSeconds > 0) throw httpError(429, `Please wait ${waitSeconds} seconds before sending a new code.`);
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_VALID_MINUTES * 60 * 1000).toISOString();

  db.transaction(() => {
    // Only the newest code works.
    db.prepare('UPDATE verification_codes SET expires_at = ? WHERE student_id = ? AND verified_at IS NULL')
      .run(now.toISOString(), studentId);
    db.prepare(`
      INSERT INTO verification_codes (student_id, mobile, code_hash, expires_at) VALUES (?, ?, ?, ?)
    `).run(studentId, student.guardian_mobile, hashCode(studentId, code), expiresAt);
    db.prepare(`
      INSERT INTO sms_messages (kind, student_id, to_mobile, body) VALUES ('verification', ?, ?, ?)
    `).run(studentId, student.guardian_mobile, messages.verificationCode(code));
  })();
  smsQueue.sendSoon();

  // testMode: the mock provider prints texts in the server window instead of sending them.
  return { sentTo: student.guardian_mobile, expiresInMinutes: CODE_VALID_MINUTES, testMode: config.sms.provider === 'mock' };
}

function confirmCode(studentId, code) {
  const row = latestCode.get(studentId);
  if (!row || row.expires_at <= new Date().toISOString()) {
    throw httpError(400, 'This code has expired. Send a new code.');
  }
  if (row.attempts >= MAX_WRONG_TRIES) throw httpError(429, 'Too many wrong tries. Send a new code.');

  const given = Buffer.from(hashCode(studentId, String(code ?? '').trim()));
  if (!crypto.timingSafeEqual(given, Buffer.from(row.code_hash))) {
    db.prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    const triesLeft = MAX_WRONG_TRIES - row.attempts - 1;
    throw httpError(400, triesLeft > 0 ? `Wrong code. ${triesLeft} tries left.` : 'Wrong code. Send a new code.');
  }

  const verifiedAt = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE verification_codes SET verified_at = ? WHERE id = ?').run(verifiedAt, row.id);
    // Only verify if the number is still the one the code was sent to.
    const { changes } = db.prepare('UPDATE students SET mobile_verified_at = ? WHERE id = ? AND guardian_mobile = ?')
      .run(verifiedAt, studentId, row.mobile);
    if (!changes) throw httpError(409, 'The mobile number was changed after the code was sent. Send a new code.');
  })();

  return { verified: true, mobile: row.mobile };
}

module.exports = { sendCode, confirmCode };
