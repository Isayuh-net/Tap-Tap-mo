// Dates and times in the school's time zone (Asia/Manila), whatever zone the PC clock is set to.
const config = require('../config');

const timeZone = config.timeZone;

// 'YYYY-MM-DD', used as school_date
function schoolDate(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone });
}

// 'HH:MM:SS' in 24-hour time, for comparing with LATE_AFTER
function schoolTime(date = new Date()) {
  return date.toLocaleTimeString('en-GB', { timeZone, hourCycle: 'h23' });
}

// '7:12 AM'. Newer Node versions put a special narrow space before AM/PM, which is not a
// plain SMS character and would make a text cost 2+ credits, so it is replaced with a normal space.
function displayTime(date) {
  return date
    .toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    .replace(/\s/g, ' ');
}

// 'Oct 8'
function displayDate(date) {
  return date.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' });
}

module.exports = { schoolDate, schoolTime, displayTime, displayDate };
