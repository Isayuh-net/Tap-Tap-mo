// Dates and times in the school's time zone (Asia/Manila), whatever zone the PC clock is set to.
const config = require('../config');

const timeZone = config.timeZone;

// 'YYYY-MM-DD', used as school_date
function schoolDate(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone });
}

// 'HH:MM:SS' in 24-hour time, for comparing with the schedule in config.js
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

// "13:00:00" -> "1:00 PM", for showing schedule times like LUNCH_END
function clockLabel(hhmmss) {
  const [h, m] = hhmmss.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// The school's UTC offset. The Philippines is UTC+8 all year (no daylight saving time).
const SCHOOL_UTC_OFFSET = '+08:00';

// "2026-10-19" -> true. Checks it is a real date, not just the right shape.
function isDateString(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text))) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

// The start and end of a school day in UTC, for filtering columns saved in UTC (like created_at).
function dayRangeUtc(dateString) {
  const start = new Date(`${dateString}T00:00:00${SCHOOL_UTC_OFFSET}`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString() };
}

// Monday to Friday (the day of the week doesn't depend on the time zone for a plain date).
function isWeekday(dateString) {
  const day = new Date(`${dateString}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

// The Monday-to-Friday dates of the week a date falls in. "2026-10-28" (a Wednesday) ->
// ["2026-10-26", ..., "2026-10-30"]. A Saturday or Sunday gives the week just before it.
function weekDates(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 24 * 60 * 60 * 1000);
  return Array.from({ length: 5 }, (_, i) => new Date(monday.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
}

// "2026-10-28" -> "2026-10-21" (n days earlier; negative n goes forward)
function daysBefore(dateString, n) {
  return new Date(new Date(`${dateString}T00:00:00Z`).getTime() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Every date of a month, "2026-10" -> ["2026-10-01", ..., "2026-10-31"]
function datesOfMonth(month) {
  const [year, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

module.exports = {
  schoolDate, schoolTime, displayTime, displayDate, clockLabel, isDateString, dayRangeUtc, isWeekday, datesOfMonth,
  weekDates, daysBefore,
};
