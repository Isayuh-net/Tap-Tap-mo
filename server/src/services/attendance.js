// Turns a card tap into an attendance record. (US-01, US-02, US-04, US-06, US-07)
//
// The school day (times in config.js / .env):
//   8:00 AM  LATE_AFTER       arriving after this is late
//  12:00 PM  LUNCH_START      tapping out from here until LUNCH_END is lunch (no text)
//   1:00 PM  LUNCH_END        coming back after this is late from lunch (texted)
//   4:00 PM  DISMISSAL_TIME   time out starts; tapping out earlier (outside lunch) is an early out (texted)
// On weekends and holidays nothing is late or early: taps simply go in and out.
//
// recordTap({ clientTapId, uid, gateId, tappedAt }):
//  1. Returns the saved result if this clientTapId was already received (the gate re-sent it).
//  2. Finds the active card and its student -> 'unregistered' or 'inactive' if not usable.
//  3. Cooldown: a tap within COOLDOWN_SECONDS of the student's previous tap -> 'cooldown'.
//  4. decideTap() works out what the tap means from the student's previous tap and the time.
//  5. Saves the tap and, if the parent's number is verified, queues the text in sms_messages,
//     both in one transaction, so a tap is never saved without its text.
//
// It uses tappedAt from the gate, not the server's clock, so taps uploaded after an outage keep
// their real time. The "previous tap" is the latest one BEFORE this tap's time, so a late upload
// from one gate is still compared with the right tap.
const db = require('../db');
const config = require('../config');
const messages = require('./messages');
const { schoolDate, schoolTime, clockLabel } = require('../utils/time');
const { normalizeUid } = require('../utils/normalize');
const { schoolDayInfo } = require('./schoolDays');
const { classLabel } = require('../utils/classLabel');

// Results that mean the student came in or went out (the others: cooldown, unregistered, inactive).
const MOVEMENTS = ['time_in', 'lunch_out', 'lunch_in', 'time_out', 'early_out'];
const IN_SCHOOL_AFTER = ['time_in', 'lunch_in']; // after these, the student is inside

// What a tap means. previousResult: the student's last movement today (or null), time: 'HH:MM:SS'.
// Returns { result, isLate, text }: text is the kind of text for the parent, or null for none.
function decideTap(previousResult, time, schoolDay) {
  const s = config.schedule;
  if (!IN_SCHOOL_AFTER.includes(previousResult)) {
    // Coming in.
    if (previousResult === 'lunch_out') {
      const late = schoolDay && time > s.lunchEnd;
      return { result: 'lunch_in', isLate: late, text: late ? 'lunch_late' : null };
    }
    // First tap of the day (late after 8:00), or coming back after leaving earlier (never late).
    const late = !previousResult && schoolDay && time > s.lateAfter;
    return { result: 'time_in', isLate: late, text: 'time_in' };
  }
  // Going out.
  if (!schoolDay || time >= s.dismissal) return { result: 'time_out', isLate: false, text: 'time_out' };
  if (time >= s.lunchStart && time < s.lunchEnd) return { result: 'lunch_out', isLate: false, text: null };
  return { result: 'early_out', isLate: false, text: 'early_out' };
}

const findTap = db.prepare('SELECT * FROM taps WHERE client_tap_id = ?');

const findCard = db.prepare(`
  SELECT c.status AS card_status, s.*
  FROM cards c JOIN students s ON s.id = c.student_id
  WHERE c.uid = ?
`);

const findPreviousTap = db.prepare(`
  SELECT * FROM taps
  WHERE student_id = ? AND school_date = ? AND tapped_at < ?
    AND result IN (${MOVEMENTS.map(() => '?').join(', ')})
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
    backBy: result === 'lunch_out' ? clockLabel(config.schedule.lunchEnd) : null, // "Be back by 1:00 PM"
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
  let textKind = null;

  const student = findCard.get(cardUid);
  if (!student) {
    tap.result = 'unregistered';
  } else if (student.card_status !== 'active' || !student.active) {
    tap.studentId = student.id;
    tap.result = 'inactive';
  } else {
    tap.studentId = student.id;
    const previous = findPreviousTap.get(student.id, tap.schoolDate, tap.tappedAt, ...MOVEMENTS);
    if (previous && date - new Date(previous.tapped_at) < config.cooldownMs) {
      tap.result = 'cooldown';
    } else {
      const decision = decideTap(previous?.result ?? null, schoolTime(date), schoolDayInfo(tap.schoolDate).schoolDay);
      tap.result = decision.result;
      tap.isLate = decision.isLate ? 1 : 0;
      textKind = decision.text;
    }
  }

  const { lastInsertRowid: tapId } = insertTap.run(tap);

  // Queue the parent's text. Only verified numbers get attendance texts (US-05).
  let smsQueued = false;
  if (textKind && student.guardian_mobile && student.mobile_verified_at) {
    const body = messages.forTap(textKind, student.full_name, classLabel(student), date, tap.isLate);
    insertSms.run({ kind: textKind, tapId, studentId: student.id, toMobile: student.guardian_mobile, body });
    smsQueued = true;
  }

  return toReply(tap, student, smsQueued);
});

module.exports = { recordTap, decideTap, MOVEMENTS };
