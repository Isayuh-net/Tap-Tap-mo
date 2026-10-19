// Adds a test student with a card, for development until the registration page is built.
// The parent's number is marked verified so attendance texts are sent right away.
//
// Usage:
//   npm run add-student -- --uid 0004567890 --name "Stephanie Lei Polonio" --grade 12 --strand STEM --section A --mobile 09170005590
//
// To find a card's number, tap it while Notepad is open: the reader types it.
const { parseArgs } = require('node:util');
const db = require('../src/db');
const { normalizeUid, normalizeMobile } = require('../src/utils/normalize');
const { classLabel } = require('../src/utils/classLabel');
const { STRANDS, canonicalStrand } = require('../src/utils/strands');

const USAGE = 'Usage: npm run add-student -- --uid 0004567890 --name "Juan Dela Cruz" --grade 12 --strand STEM --section A --mobile 09171234567';

function fail(message) {
  console.error(message);
  process.exit(1);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      uid: { type: 'string' },
      name: { type: 'string' },
      grade: { type: 'string', default: '12' },
      strand: { type: 'string', default: 'STEM' },
      section: { type: 'string', default: 'A' },
      guardian: { type: 'string' },
      mobile: { type: 'string' },
    },
  }));
} catch (err) {
  // e.g. "-- name" typed with a space, or an option name with a typo
  fail(`${err.message}
${USAGE}`);
}

const uid = normalizeUid(values.uid);
const name = values.name?.trim().replace(/\s+/g, ' '); // " Rovic  Elgarico " -> "Rovic Elgarico"
const grade = Number(values.grade);
const strand = canonicalStrand(values.strand); // "stem" -> "STEM"
const section = values.section.trim();
const mobile = values.mobile ? normalizeMobile(values.mobile) : null;
if (!uid || !name) fail(`Required: --uid and --name
${USAGE}`);
if (grade !== 11 && grade !== 12) fail('--grade must be 11 or 12');
if (!strand) fail(`Unknown strand "${values.strand}". Use one of: ${STRANDS.join(', ')}`);
if (values.mobile && !mobile) fail(`Not a valid PH mobile number: ${values.mobile}`);

const existing = db.prepare('SELECT student_id FROM cards WHERE uid = ?').get(uid);
if (existing) fail(`Card ${uid} is already registered to student #${existing.student_id}`);

const addStudent = db.transaction(() => {
  const { lastInsertRowid: studentId } = db.prepare(`
    INSERT INTO students (full_name, grade_level, strand, section, guardian_name, guardian_mobile, mobile_verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, grade, strand, section, values.guardian ?? null, mobile, mobile ? new Date().toISOString() : null);
  db.prepare('INSERT INTO cards (uid, student_id) VALUES (?, ?)').run(uid, studentId);
  return studentId;
});

const studentId = addStudent();
const label = classLabel({ grade_level: grade, strand, section });
console.log(`Added student #${studentId}: ${name}, ${label}, card ${uid}` +
  (mobile ? `, parent ${mobile} (verified)` : ', no parent number (no texts will be sent)'));
