// Student records and their RFID cards. (US-05, US-08)
// A new student is saved with an UNVERIFIED parent number; verification.js marks it verified.
const db = require('../db');
const { normalizeUid, normalizeMobile } = require('../utils/normalize');
const { canonicalStrand } = require('../utils/strands');
const { classLabel } = require('../utils/classLabel');
const { httpError } = require('../utils/httpError');

const findStudent = db.prepare('SELECT * FROM students WHERE id = ?');
const findActiveCard = db.prepare("SELECT uid FROM cards WHERE student_id = ? AND status = 'active'");
const findCardOwner = db.prepare(`
  SELECT c.uid, c.status AS card_status, s.*
  FROM cards c JOIN students s ON s.id = c.student_id
  WHERE c.uid = ?
`);

// What pages get for a student.
function toJson(student) {
  return {
    id: student.id,
    fullName: student.full_name,
    gradeLevel: student.grade_level,
    strand: student.strand,
    section: student.section,
    classLabel: classLabel(student),
    guardianName: student.guardian_name,
    guardianMobile: student.guardian_mobile,
    mobileVerified: Boolean(student.mobile_verified_at),
    cardUid: findActiveCard.get(student.id)?.uid ?? null,
  };
}

// Checks and cleans the fields from the registration form. Throws one 400 error listing every problem.
function cleanFields(body) {
  const fields = {
    fullName: String(body.fullName ?? '').trim().replace(/\s+/g, ' '),
    gradeLevel: Number(body.gradeLevel),
    strand: canonicalStrand(body.strand),
    section: String(body.section ?? '').trim(),
    guardianName: String(body.guardianName ?? '').trim().replace(/\s+/g, ' ') || null,
    guardianMobile: normalizeMobile(body.guardianMobile),
  };
  const problems = [];
  if (!fields.fullName || fields.fullName.length > 100) problems.push('enter the student\'s full name');
  if (fields.gradeLevel !== 11 && fields.gradeLevel !== 12) problems.push('grade must be 11 or 12');
  if (!fields.strand) problems.push('choose a strand');
  if (!fields.section || fields.section.length > 30) problems.push('enter the section');
  if (!fields.guardianMobile) problems.push('enter a valid mobile number, like 09171234567');
  if (problems.length) throw httpError(400, `Please ${problems.join('; ')}.`);
  return fields;
}

// Who owns this card? Returns null for a card that was never registered.
function findByCard(uid) {
  const row = findCardOwner.get(normalizeUid(uid));
  return row ? { cardStatus: row.card_status, student: toJson(row) } : null;
}

// Registers a new student together with their card.
const create = db.transaction((body) => {
  const uid = normalizeUid(body.uid);
  if (!uid) throw httpError(400, 'Tap the student\'s card on the reader first.');
  const f = cleanFields(body);
  const owner = findCardOwner.get(uid);
  if (owner) throw httpError(409, `This card is already registered to ${owner.full_name}.`);

  const { lastInsertRowid: id } = db.prepare(`
    INSERT INTO students (full_name, grade_level, strand, section, guardian_name, guardian_mobile)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(f.fullName, f.gradeLevel, f.strand, f.section, f.guardianName, f.guardianMobile);
  db.prepare('INSERT INTO cards (uid, student_id) VALUES (?, ?)').run(uid, id);
  return toJson(findStudent.get(id));
});

// Updates a student's details. Changing the parent's number makes it unverified again.
const update = db.transaction((id, body) => {
  const student = findStudent.get(id);
  if (!student) throw httpError(404, 'Student not found.');
  const f = cleanFields(body);
  const mobileChanged = f.guardianMobile !== student.guardian_mobile;
  db.prepare(`
    UPDATE students
    SET full_name = ?, grade_level = ?, strand = ?, section = ?, guardian_name = ?, guardian_mobile = ?,
        mobile_verified_at = CASE WHEN ? THEN NULL ELSE mobile_verified_at END
    WHERE id = ?
  `).run(f.fullName, f.gradeLevel, f.strand, f.section, f.guardianName, f.guardianMobile, mobileChanged ? 1 : 0, id);
  return toJson(findStudent.get(id));
});

module.exports = { findByCard, create, update };
