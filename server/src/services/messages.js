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

// "BCNHS: Stephanie Polonio (Grade 12 - STEM A) arrived at school at 7:12 AM on Oct 8. Automated message, do not reply."
function timeIn(name, classLabel, date, isLate) {
  const late = isLate ? 'LATE ' : '';
  const event = `arrived ${late}at school at ${displayTime(date)} on ${displayDate(date)}.`;
  return firstThatFits(
    `${sender}: ${name} (${classLabel}) ${event}${FOOTER}`,
    `${sender}: ${name} (${classLabel}) ${event}`,
    `${sender}: ${name} ${event}`,
  );
}

// "BCNHS: Stephanie Polonio (Grade 12 - STEM A) left school at 4:35 PM on Oct 7. Automated message, do not reply."
function timeOut(name, classLabel, date) {
  const event = `left school at ${displayTime(date)} on ${displayDate(date)}.`;
  return firstThatFits(
    `${sender}: ${name} (${classLabel}) ${event}${FOOTER}`,
    `${sender}: ${name} (${classLabel}) ${event}`,
    `${sender}: ${name} ${event}`,
  );
}

function verificationCode(code) {
  return check(`${sender}: Your Tap-Tap Mo verification code is ${code}. Give it only to the school staff registering your child.`);
}

module.exports = { timeIn, timeOut, verificationCode, fitsOneCredit };
