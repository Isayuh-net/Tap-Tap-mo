// Clean up card numbers and mobile numbers so the same value is always stored the same way.

// Readers may type the card number with spaces or in lowercase hex. "04 a3 7f 2b" -> "04A37F2B"
function normalizeUid(uid) {
  return String(uid ?? '').replace(/\s+/g, '').toUpperCase();
}

// Accepts 09171234567, +639171234567, 639171234567 or 9171234567 -> "09171234567".
// Returns null if it is not a valid Philippine mobile number.
function normalizeMobile(mobile) {
  const digits = String(mobile ?? '').replace(/\D/g, '');
  const match = digits.match(/^(?:63|0)?(9\d{9})$/);
  return match ? `0${match[1]}` : null;
}

module.exports = { normalizeUid, normalizeMobile };
