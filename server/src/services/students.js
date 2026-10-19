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

// What pages get for a student. Rows from list() already include card_uid.
function toJson(student) {
  return {
    id: student.id,
    lrn: student.lrn,
    fullName: student.full_name,
    gradeLevel: student.grade_level,
    strand: student.strand,
    section: student.section,
    classLabel: classLabel(student),
    guardianName: student.guardian_name,
    guardianMobile: student.guardian_mobile,
    mobileVerified: Boolean(student.mobile_verified_at),
    cardUid: 'card_uid' in student ? student.card_uid : findActiveCard.get(student.id)?.uid ?? null,
  };
}

// Checks and cleans student fields from the registration form or an imported row.
// Returns { fields, problems }; problems are short phrases like "enter the section".
// requireMobile: false lets an import row through without a number (it just gets no texts yet).
function checkFields(body, { requireMobile = true } = {}) {
  const rawMobile = String(body.guardianMobile ?? '').trim();
  const fields = {
    fullName: String(body.fullName ?? '').trim().replace(/\s+/g, ' '),
    gradeLevel: Number(body.gradeLevel),
    strand: canonicalStrand(body.strand),
    section: String(body.section ?? '').trim(),
    guardianName: String(body.guardianName ?? '').trim().replace(/\s+/g, ' ') || null,
    guardianMobile: normalizeMobile(rawMobile),
  };
  const problems = [];
  if (!fields.fullName || fields.fullName.length > 100) problems.push('enter the student\'s full name');
  if (fields.gradeLevel !== 11 && fields.gradeLevel !== 12) problems.push('grade must be 11 or 12');
  if (!fields.strand) problems.push(body.strand ? `"${body.strand}" is not a known strand` : 'choose a strand');
  if (!fields.section || fields.section.length > 30) problems.push('enter the section');
  if (rawMobile && !fields.guardianMobile) problems.push(`"${rawMobile}" is not a valid mobile number`);
  if (!rawMobile && requireMobile) problems.push('enter a valid mobile number, like 09171234567');
  return { fields, problems };
}

// Same check for the registration form, as one 400 error listing every problem.
function cleanFields(body) {
  const { fields, problems } = checkFields(body);
  if (problems.length) throw httpError(400, `Please ${problems.join('; ')}.`);
  return fields;
}

// Active students, optionally filtered: { gradeLevel, strand, section, q (part of the name) }.
function list({ gradeLevel, strand, section, q } = {}) {
  const where = ['s.active = 1'];
  const params = [];
  if (gradeLevel) { where.push('s.grade_level = ?'); params.push(Number(gradeLevel)); }
  if (strand) { where.push('s.strand = ?'); params.push(strand); }
  if (section) { where.push('s.section = ?'); params.push(section); }
  if (q) { where.push('s.full_name LIKE ?'); params.push(`%${q}%`); }
  return db.prepare(`
    SELECT s.*, c.uid AS card_uid
    FROM students s LEFT JOIN cards c ON c.student_id = s.id AND c.status = 'active'
    WHERE ${where.join(' AND ')}
    ORDER BY s.full_name
  `).all(...params).map(toJson);
}

// Every class (grade + strand + section) with how many students still need a card or a verified number.
function classes() {
  return db.prepare(`
    SELECT s.grade_level, s.strand, s.section, COUNT(*) AS students, COUNT(c.uid) AS with_card,
           COUNT(s.mobile_verified_at) AS verified
    FROM students s LEFT JOIN cards c ON c.student_id = s.id AND c.status = 'active'
    WHERE s.active = 1
    GROUP BY s.grade_level, s.strand, s.section
    ORDER BY s.grade_level, s.strand, s.section
  `).all().map((r) => ({
    gradeLevel: r.grade_level,
    strand: r.strand,
    section: r.section,
    classLabel: classLabel(r),
    students: r.students,
    withoutCard: r.students - r.with_card,
    unverified: r.students - r.verified,
  }));
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

// Links a card to a student who has no card yet (used by the Assign cards page).
const assignCard = db.transaction((uid, studentId) => {
  uid = normalizeUid(uid);
  if (!uid) throw httpError(400, 'Tap a card on the reader.');
  const student = findStudent.get(studentId);
  if (!student || !student.active) throw httpError(404, 'Student not found.');
  const owner = findCardOwner.get(uid);
  if (owner) throw httpError(409, `This card is already registered to ${owner.full_name}.`);
  const current = findActiveCard.get(studentId);
  if (current) throw httpError(409, `${student.full_name} already has card ${current.uid}.`);
  db.prepare('INSERT INTO cards (uid, student_id) VALUES (?, ?)').run(uid, studentId);
  return toJson(findStudent.get(studentId));
});

// Undoes a card assignment made by mistake. Only allowed before the card is used at the gate;
// after that the card should be deactivated instead, so its attendance history stays.
const removeUnusedCard = db.transaction((uid) => {
  uid = normalizeUid(uid);
  const card = db.prepare('SELECT * FROM cards WHERE uid = ?').get(uid);
  if (!card) throw httpError(404, 'Card not found.');
  const used = db.prepare('SELECT 1 FROM taps WHERE card_uid = ? AND student_id IS NOT NULL LIMIT 1').get(uid);
  if (used) throw httpError(409, 'This card has already been used at the gate, so it can only be deactivated.');
  db.prepare('DELETE FROM cards WHERE uid = ?').run(uid);
  return { removed: uid };
});

module.exports = { checkFields, list, classes, findByCard, create, update, assignCard, removeUnusedCard };
