// School days are Monday to Friday, except dates in the holidays table.
const db = require('../db');
const { isWeekday } = require('../utils/time');

const findHoliday = db.prepare('SELECT name FROM holidays WHERE date = ?');

// "2026-10-19" -> { schoolDay: true, holiday: null }
function schoolDayInfo(date) {
  const holiday = findHoliday.get(date)?.name ?? null;
  return { schoolDay: isWeekday(date) && !holiday, holiday };
}

module.exports = { schoolDayInfo };
