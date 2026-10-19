// Parent mobile number verification. (US-05, Figure 6) Only verified numbers get attendance texts.
//  - sendCode(studentId): texts a 6-digit code to one parent (Register card page, or one row of a class).
//  - sendCodesForClass(cls): texts codes to every unverified parent in a class (Verify numbers page).
//  - confirmCode(studentId, code): marks the number verified if the code is right.
//  - classStatus(cls): each student in a class with their verification status.
//
// At the registration desk the parent is there, so a code works for 10 minutes. A class code travels
// parent -> child -> adviser, so it works for 3 days. Only a hash of each code is saved, only the
// newest code for a student works, 5 wrong tries cancel it, and a new code can be sent after 60 seconds.
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const messages = require('./messages');
const smsQueue = require('./smsQueue');
const students = require('./students');
const { httpError } = require('../utils/httpError');

const CODE_VALID_MINUTES = 10;
const CLASS_CODE_VALID_MINUTES = 3 * 24 * 60;
const MAX_WRONG_TRIES = 5;
const RESEND_AFTER_SECONDS = 60;

const testMode = () => config.sms.provider === 'mock'; // the mock provider prints texts instead of sending

const findStudent = db.prepare('SELECT * FROM students WHERE id = ?');
const latestCode = db.prepare(`
  SELECT * FROM verification_codes WHERE student_id = ? AND verified_at IS NULL ORDER BY id DESC LIMIT 1
`);
const cancelCodes = db.prepare('UPDATE verification_codes SET expires_at = ? WHERE student_id = ? AND verified_at IS NULL');
const insertCode = db.prepare(`
  INSERT INTO verification_codes (student_id, mobile, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
`);
const insertSms = db.prepare(`
  INSERT INTO sms_messages (kind, student_id, to_mobile, body) VALUES ('verification', ?, ?, ?)
`);
const latestText = db.prepare(`
  SELECT status, last_error FROM sms_messages WHERE student_id = ? AND kind = 'verification' ORDER BY id DESC LIMIT 1
`);
const classStudents = db.prepare(`
  SELECT * FROM students WHERE active = 1 AND grade_level = ? AND strand = ? AND section = ?
`);

// Tied to the student and signed with the server secret, so the saved hash can't be used to guess codes.
function hashCode(studentId, code) {
  return crypto.createHmac('sha256', config.sessionSecret).update(`${studentId}:${code}`).digest('hex');
}

// Codes saved before created_at existed were all 10-minute codes.
function sentAt(code) {
  return code.created_at ?? new Date(Date.parse(code.expires_at) - CODE_VALID_MINUTES * 60 * 1000).toISOString();
}

// A code the parent can still use: not expired, not too many wrong tries, and sent to the number
// we have now (a code sent before the number was corrected doesn't count).
function isPending(code, mobile) {
  return Boolean(code) && code.mobile === mobile
    && code.expires_at > new Date().toISOString() && code.attempts < MAX_WRONG_TRIES;
}

// Makes a new code for one student (older codes stop working) and queues the text.
// Call inside a transaction, then smsQueue.sendSoon().
function issueCode(student, validMinutes) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + validMinutes * 60 * 1000).toISOString();
  cancelCodes.run(now.toISOString(), student.id);
  insertCode.run(student.id, student.guardian_mobile, hashCode(student.id, code), expiresAt, now.toISOString());
  insertSms.run(student.id, student.guardian_mobile, messages.verificationCode(code));
}

// forClass: true gives the 3-day code used on the Verify numbers page.
function sendCode(studentId, { forClass = false } = {}) {
  const student = findStudent.get(studentId);
  if (!student) throw httpError(404, 'Student not found.');
  if (!student.guardian_mobile) throw httpError(400, 'This student has no parent mobile number.');
  if (student.mobile_verified_at) throw httpError(409, 'This parent\'s number is already verified.');

  const last = latestCode.get(studentId);
  if (last) {
    const waitSeconds = Math.ceil(RESEND_AFTER_SECONDS - (Date.now() - Date.parse(sentAt(last))) / 1000);
    if (waitSeconds > 0) throw httpError(429, `Please wait ${waitSeconds} seconds before sending a new code.`);
  }

  const validMinutes = forClass ? CLASS_CODE_VALID_MINUTES : CODE_VALID_MINUTES;
  db.transaction(() => issueCode(student, validMinutes))();
  smsQueue.sendSoon();
  return { sentTo: student.guardian_mobile, expiresInMinutes: validMinutes, testMode: testMode() };
}

function checkClass({ gradeLevel, strand, section } = {}) {
  const cls = { gradeLevel: Number(gradeLevel), strand: String(strand ?? ''), section: String(section ?? '') };
  if (!cls.gradeLevel || !cls.strand || !cls.section) throw httpError(400, 'Choose a class first.');
  return cls;
}

// Texts a code to every parent in the class who isn't verified and has no usable code yet.
// Parents who already have a usable code are skipped, so sending twice doesn't cancel codes
// that are already on their way to the adviser.
function sendCodesForClass(classFilter) {
  const cls = checkClass(classFilter);
  const result = { sent: 0, alreadyVerified: 0, alreadyHaveCode: 0, noNumber: 0 };
  db.transaction(() => {
    for (const student of classStudents.all(cls.gradeLevel, cls.strand, cls.section)) {
      if (student.mobile_verified_at) result.alreadyVerified++;
      else if (!student.guardian_mobile) result.noNumber++;
      else if (isPending(latestCode.get(student.id), student.guardian_mobile)) result.alreadyHaveCode++;
      else {
        issueCode(student, CLASS_CODE_VALID_MINUTES);
        result.sent++;
      }
    }
  })();
  if (result.sent) smsQueue.sendSoon();
  return { ...result, testMode: testMode() };
}

// The class checklist: every student with their number and verification status.
// pendingCode is set when a usable code is out: { sentAt, expiresAt, triesLeft, textStatus, textError },
// where textStatus is the code text's delivery status (queued, sent, delivered or failed).
function classStatus(classFilter) {
  const cls = checkClass(classFilter);
  return students.list(cls).map((student) => {
    const code = latestCode.get(student.id);
    if (student.mobileVerified || !isPending(code, student.guardianMobile)) return { ...student, pendingCode: null };
    const text = latestText.get(student.id);
    const pendingCode = {
      sentAt: sentAt(code),
      expiresAt: code.expires_at,
      triesLeft: MAX_WRONG_TRIES - code.attempts,
      textStatus: text?.status ?? null,
      textError: text?.last_error ?? null,
    };
    return { ...student, pendingCode };
  });
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

module.exports = { sendCode, sendCodesForClass, classStatus, confirmCode };
