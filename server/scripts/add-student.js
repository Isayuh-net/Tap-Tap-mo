// Adds a test student with a card, for development until the registration page is built.
// The parent's number is marked verified so attendance texts are sent right away.
//
// Usage:
//   npm run add-student -- --uid 0004567890 --name "Stephanie Lei Polonio" --grade 12 --section "STEM A" --mobile 09170005590
//
// To find a card's number, tap it while Notepad is open: the reader types it.
const { parseArgs } = require('node:util');
const db = require('../src/db');
const { normalizeUid, normalizeMobile } = require('../src/utils/normalize');

const { values } = parseArgs({
  options: {
    uid: { type: 'string' },
    name: { type: 'string' },
    grade: { type: 'string', default: '12' },
    section: { type: 'string', default: 'STEM A' },
    guardian: { type: 'string' },
    mobile: { type: 'string' },
  },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

const uid = normalizeUid(values.uid);
const grade = Number(values.grade);
const mobile = values.mobile ? normalizeMobile(values.mobile) : null;
if (!uid || !values.name) fail('Required: --uid and --name');
if (grade !== 11 && grade !== 12) fail('--grade must be 11 or 12');
if (values.mobile && !mobile) fail(`Not a valid PH mobile number: ${values.mobile}`);

const existing = db.prepare('SELECT student_id FROM cards WHERE uid = ?').get(uid);
if (existing) fail(`Card ${uid} is already registered to student #${existing.student_id}`);

const addStudent = db.transaction(() => {
  const { lastInsertRowid: studentId } = db.prepare(`
    INSERT INTO students (full_name, grade_level, section, guardian_name, guardian_mobile, mobile_verified_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(values.name, grade, values.section, values.guardian ?? null, mobile, mobile ? new Date().toISOString() : null);
  db.prepare('INSERT INTO cards (uid, student_id) VALUES (?, ?)').run(uid, studentId);
  return studentId;
});

const studentId = addStudent();
console.log(`Added student #${studentId}: ${values.name}, Grade ${grade} - ${values.section}, card ${uid}` +
  (mobile ? `, parent ${mobile} (verified)` : ', no parent number (no texts will be sent)'));
