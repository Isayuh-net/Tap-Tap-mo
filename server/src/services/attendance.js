// Turns a card tap into an attendance record. (US-01, US-02, US-04, US-06, US-07)
//
// recordTap({ clientTapId, uid, gateId, tappedAt }):
//  1. Returns the saved result if this clientTapId was already received (the gate re-sent it).
//  2. Finds the active card and its student -> 'unregistered' or 'inactive' if not usable.
//  3. Cooldown: a tap within COOLDOWN_SECONDS of the student's previous tap -> 'cooldown'.
//  4. Toggle: first tap of the school day, or a tap after a time out -> 'time_in'; otherwise 'time_out'.
//  5. Marks the first time in of a school day as late if it is after LATE_AFTER (never on weekends
//     or holidays, so nobody gets a "LATE" text for coming in on a Saturday).
//  6. Saves the tap and, if the parent's number is verified, queues the text in sms_messages,
//     both in one transaction, so a tap is never saved without its text.
//
// It uses tappedAt from the gate, not the server's clock, so taps uploaded after an outage keep
// their real time. The "previous tap" is the latest one BEFORE this tap's time, so a late upload
// from one gate is still compared with the right tap.
const db = require('../db');
const config = require('../config');
const messages = require('./messages');
const { schoolDate, schoolTime } = require('../utils/time');
const { normalizeUid } = require('../utils/normalize');
const { schoolDayInfo } = require('./schoolDays');
const { classLabel } = require('../utils/classLabel');

const findTap = db.prepare('SELECT * FROM taps WHERE client_tap_id = ?');

const findCard = db.prepare(`
  SELECT c.status AS card_status, s.*
  FROM cards c JOIN students s ON s.id = c.student_id
  WHERE c.uid = ?
`);

const findPreviousTap = db.prepare(`
  SELECT * FROM taps
  WHERE student_id = ? AND school_date = ? AND tapped_at < ?
    AND result IN ('time_in', 'time_out')
  ORDER BY tapped_at DESC
  LIMIT 1
`);

const findStudent = db.prepare('SELECT * FROM students WHERE id = ?');

const insertTap = db.prepare(`
  INSERT INTO taps (client_tap_id, gate_id, card_uid, student_id, tapped_at, school_date, result, is_late)
  VALUES (@clientTapId, @gateId, @uid, @studentId, @tappedAt, @schoolDate, @result, @isLate)
`);

const insertSms = db.prepare(`
  INSERT INTO sms_messages (kind, tap_id, student_id, to_mobile, body)
  VALUES (@kind, @tapId, @studentId, @toMobile, @body)
`);

// What the gate needs to show for a saved tap.
function toReply({ clientTapId, result, isLate }, student, smsQueued) {
  return {
    clientTapId,
    result,
    isLate: Boolean(isLate),
    name: student ? student.full_name : null,
    gradeSection: student ? classLabel(student) : null,
    smsQueued,
  };
}

// The gate's clock is trusted, but a missing or broken time falls back to the server's clock.
function parseTapTime(tappedAt) {
  const date = new Date(tappedAt);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

const recordTap = db.transaction(({ clientTapId, uid, gateId, tappedAt }) => {
  const saved = findTap.get(clientTapId);
  if (saved) {
    const student = saved.student_id ? findStudent.get(saved.student_id) : null;
    const reply = { clientTapId, result: saved.result, isLate: saved.is_late };
    return toReply(reply, student, false);
  }

  const cardUid = normalizeUid(uid);
  const date = parseTapTime(tappedAt);
  const tap = {
    clientTapId,
    gateId,
    uid: cardUid,
    studentId: null,
    tappedAt: date.toISOString(),
    schoolDate: schoolDate(date),
    result: null,
    isLate: 0,
  };

  const student = findCard.get(cardUid);
  if (!student) {
    tap.result = 'unregistered';
  } else if (student.card_status !== 'active' || !student.active) {
    tap.studentId = student.id;
    tap.result = 'inactive';
  } else {
    tap.studentId = student.id;
    const previous = findPreviousTap.get(student.id, tap.schoolDate, tap.tappedAt);
    if (previous && date - new Date(previous.tapped_at) < config.cooldownMs) {
      tap.result = 'cooldown';
    } else if (!previous || previous.result === 'time_out') {
      tap.result = 'time_in';
      tap.isLate = !previous && schoolDayInfo(tap.schoolDate).schoolDay && schoolTime(date) > config.lateAfter ? 1 : 0;
    } else {
      tap.result = 'time_out';
    }
  }

  const { lastInsertRowid: tapId } = insertTap.run(tap);

  // Queue the parent's text. Only verified numbers get attendance texts (US-05).
  let smsQueued = false;
  const isAttendance = tap.result === 'time_in' || tap.result === 'time_out';
  if (isAttendance && student.guardian_mobile && student.mobile_verified_at) {
    const body = tap.result === 'time_in'
      ? messages.timeIn(student.full_name, classLabel(student), date, tap.isLate)
      : messages.timeOut(student.full_name, classLabel(student), date);
    insertSms.run({ kind: tap.result, tapId, studentId: student.id, toMobile: student.guardian_mobile, body });
    smsQueued = true;
  }

  return toReply(tap, student, smsQueued);
});

module.exports = { recordTap };
