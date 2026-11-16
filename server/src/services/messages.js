// SMS text templates (Figure 4 of the design doc). Every text must fit in ONE credit:
// at most 160 characters, using only plain SMS (GSM-7) characters, with no emoji or curly quotes.
const config = require('../config');
const settings = require('./settings');
const { displayTime, displayDate, clockLabel } = require('../utils/time');

// The school's short name at the start of every text, e.g. "BCNHS" (set on Lunch and SMS settings).
// It is separate from the sender name the phone shows, which the SMS provider approves.
const textPrefix = () => settings.sms().textPrefix;
const FOOTER = ' Automated message, do not reply.';

// Letters, digits, common punctuation, and the accented letters in the GSM-7 alphabet (like ñ).
const PLAIN_SMS = /^[A-Za-z0-9 .,:;!?'"()\-/@&%#*+=<>_\n\rñÑéèùìòàÄÖÜäöüÅåÇØø£$¥]*$/;

function fitsOneCredit(text) {
  return text.length <= 160 && PLAIN_SMS.test(text);
}

function check(text) {
  // Only the length is logged: the text itself has the student's name.
  if (!fitsOneCredit(text)) console.warn(`An SMS may use more than one credit (${text.length} characters, or a special character).`);
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
    `${textPrefix()}: ${name} (${classLabel}) ${event}${FOOTER}`,
    `${textPrefix()}: ${name} (${classLabel}) ${event}`,
    `${textPrefix()}: ${name} ${event}`,
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

// The late-from-lunch text can be changed on Lunch and SMS settings. The words in brackets are
// filled in for each student.
const LUNCH_LATE_WORDS = {
  'student name': (v) => v.name,
  section: (v) => v.classLabel,
  time: (v) => displayTime(v.date),
  date: (v) => displayDate(v.date),
  cutoff: () => clockLabel(config.schedule.lunchEnd),
};

function defaultLunchLateText() {
  return `${textPrefix()}: [Student name] ([section]) came back LATE from lunch at [time], after the [cutoff] cutoff.${FOOTER}`;
}

// The words in brackets that aren't known, e.g. "[Name]" -> ['Name'].
function unknownWords(template) {
  return [...template.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]).filter((w) => !(w.trim().toLowerCase() in LUNCH_LATE_WORDS));
}

function fillLunchLate(template, values) {
  return template.replace(/\[([^\]]*)\]/g, (whole, word) => LUNCH_LATE_WORDS[word.trim().toLowerCase()]?.(values) ?? whole);
}

// "BCNHS: Juan Dela Cruz (Grade 11 - STEM A) came back LATE from lunch at 1:15 PM, after the 1:00 PM cutoff. ..."
// If the school's text doesn't fit in one credit (a long name), a shorter built-in text is used.
function lunchLate(name, classLabel, date) {
  const values = { name, classLabel, date };
  return firstThatFits(
    fillLunchLate(settings.get('lunchLateText') ?? defaultLunchLateText(), values),
    fillLunchLate(defaultLunchLateText(), values),
    `${textPrefix()}: ${name} (${classLabel}) came back LATE from lunch ${at(date)}`,
    `${textPrefix()}: ${name} came back LATE from lunch ${at(date)}`,
  );
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
  return check(`${textPrefix()}: Your Tap-Tap Mo verification code is ${code}. Give it only to your child's adviser or the school staff.`);
}

module.exports = {
  forTap, timeIn, timeOut, lunchLate, earlyOut, verificationCode, fitsOneCredit,
  defaultLunchLateText, fillLunchLate, unknownWords, PLAIN_SMS,
};
