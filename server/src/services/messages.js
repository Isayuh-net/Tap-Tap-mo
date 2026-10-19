// SMS text templates (Figure 4 of the design doc). Every text must fit in ONE credit:
// at most 160 characters, using only plain SMS (GSM-7) characters, with no emoji or curly quotes.
const config = require('../config');
const { displayTime, displayDate } = require('../utils/time');

const sender = config.sms.senderName;
const FOOTER = ' Automated message, do not reply.';

// Letters, digits, common punctuation, and the accented letters in the GSM-7 alphabet (like ñ).
const PLAIN_SMS = /^[A-Za-z0-9 .,:;!?'"()\-/@&%#*+=<>_\n\rñÑéèùìòàÄÖÜäöüÅåÇØø£$¥]*$/;

function fitsOneCredit(text) {
  return text.length <= 160 && PLAIN_SMS.test(text);
}

function check(text) {
  if (!fitsOneCredit(text)) console.warn(`SMS may use more than one credit (${text.length} chars): ${text}`);
  return text;
}

// Uses the first version that fits in one credit, so a long name drops the extras instead of
// costing two credits.
function firstThatFits(...versions) {
  return check(versions.find(fitsOneCredit) ?? versions[versions.length - 1]);
}

// One attendance text: "BCNHS: <name> (<class>) <event> Automated message, do not reply."
function attendanceText(name, classLabel, event) {
  return firstThatFits(
    `${sender}: ${name} (${classLabel}) ${event}${FOOTER}`,
    `${sender}: ${name} (${classLabel}) ${event}`,
    `${sender}: ${name} ${event}`,
  );
}

const at = (date) => `at ${displayTime(date)} on ${displayDate(date)}.`;

// "BCNHS: Stephanie Polonio (Grade 12 - STEM A) arrived at school at 7:12 AM on Oct 8. Automated message, do not reply."
function timeIn(name, classLabel, date, isLate) {
  return attendanceText(name, classLabel, `arrived ${isLate ? 'LATE ' : ''}at school ${at(date)}`);
}

// "... left school at 4:35 PM on Oct 7. ..."
function timeOut(name, classLabel, date) {
  return attendanceText(name, classLabel, `left school ${at(date)}`);
}

// "... came back LATE from lunch at 1:15 PM on Oct 7. ..."
function lunchLate(name, classLabel, date) {
  return attendanceText(name, classLabel, `came back LATE from lunch ${at(date)}`);
}

// "... left school EARLY at 10:15 AM on Oct 7. ..."
function earlyOut(name, classLabel, date) {
  return attendanceText(name, classLabel, `left school EARLY ${at(date)}`);
}

// The text for a tap, by the kind decided in attendance.js
function forTap(kind, name, classLabel, date, isLate) {
  if (kind === 'time_in') return timeIn(name, classLabel, date, isLate);
  if (kind === 'time_out') return timeOut(name, classLabel, date);
  if (kind === 'lunch_late') return lunchLate(name, classLabel, date);
  if (kind === 'early_out') return earlyOut(name, classLabel, date);
  throw new Error(`No text for "${kind}"`);
}

function verificationCode(code) {
  return check(`${sender}: Your Tap-Tap Mo verification code is ${code}. Give it only to your child's adviser or the school staff.`);
}

module.exports = { forTap, timeIn, timeOut, lunchLate, earlyOut, verificationCode, fitsOneCredit };
