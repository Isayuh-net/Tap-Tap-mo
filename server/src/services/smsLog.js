// The SMS log: every text with its status, today's counts, and retrying failed texts. (US-10, US-11, US-12)
const db = require('../db');
const sms = require('./sms');
const smsQueue = require('./smsQueue');
const internet = require('./internet');
const { classLabel } = require('../utils/classLabel');
const { schoolDate, dayRangeUtc } = require('../utils/time');
const { httpError } = require('../utils/httpError');

const KIND_LABELS = {
  time_in: 'Time in',
  time_out: 'Time out',
  lunch_late: 'Late from lunch',
  early_out: 'Left early',
  verification: 'Verification code',
  absent: 'Absent',
};
const STATUS_FILTERS = {
  attention: ['failed', 'queued', 'sending'], // what staff should look at
  failed: ['failed'],
  queued: ['queued', 'sending'],
  sent: ['sent', 'delivered'],
};

const shortDateTime = (iso) => new Date(iso).toLocaleString('en-US', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

// Texts, newest first. status: attention | failed | queued | sent | all. date: "YYYY-MM-DD" (optional).
function list({ status = 'attention', date } = {}) {
  const where = [];
  const params = [];
  if (STATUS_FILTERS[status]) {
    where.push(`m.status IN (${STATUS_FILTERS[status].map(() => '?').join(', ')})`);
    params.push(...STATUS_FILTERS[status]);
  }
  if (date) {
    const { start, end } = dayRangeUtc(date);
    where.push('m.created_at >= ? AND m.created_at < ?');
    params.push(start, end);
  }
  return db.prepare(`
    SELECT m.*, s.full_name, s.grade_level, s.strand, s.section, s.guardian_mobile, s.mobile_verified_at
    FROM sms_messages m LEFT JOIN students s ON s.id = m.student_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY m.id DESC
    LIMIT 500
  `).all(...params).map((m) => ({
    id: m.id,
    createdAt: shortDateTime(m.created_at),
    kind: m.kind,
    kindLabel: KIND_LABELS[m.kind] ?? m.kind,
    studentId: m.student_id,
    name: m.full_name,
    classLabel: m.full_name ? classLabel(m) : '',
    toMobile: m.to_mobile,
    currentMobile: m.guardian_mobile,        // may differ if the number was corrected later
    mobileVerified: Boolean(m.mobile_verified_at),
    status: m.status,
    attempts: m.attempts,
    lastError: m.last_error,
    nextAttemptAt: m.status === 'queued' ? shortDateTime(m.next_attempt_at) : null,
    body: m.body,
  }));
}

// Credits left, checked at most every 5 minutes (null if the provider can't tell us).
let balance = { value: null, checkedAt: 0 };
async function creditsLeft() {
  if (Date.now() - balance.checkedAt > 5 * 60 * 1000) {
    let value = null;
    try {
      value = await sms.getBalance();
    } catch {
      // provider not set up or unreachable: keep showing "not available"
    }
    balance = { value, checkedAt: Date.now() };
  }
  return balance.value;
}

// For the dashboard: today's texts by status, the whole waiting queue, credits and internet.
async function stats() {
  const { start, end } = dayRangeUtc(schoolDate());
  const todayCounts = Object.fromEntries(db.prepare(`
    SELECT status, COUNT(*) AS n FROM sms_messages WHERE created_at >= ? AND created_at < ? GROUP BY status
  `).all(start, end).map((r) => [r.status, r.n]));
  const n = (...statuses) => statuses.reduce((sum, s) => sum + (todayCounts[s] ?? 0), 0);
  const waiting = db.prepare("SELECT COUNT(*) AS n FROM sms_messages WHERE status IN ('queued', 'sending')").get().n;
  const failedTotal = db.prepare("SELECT COUNT(*) AS n FROM sms_messages WHERE status = 'failed'").get().n;
  return {
    today: { sent: n('sent', 'delivered'), queued: n('queued', 'sending'), failed: n('failed') },
    waiting,
    failedTotal,
    credits: await creditsLeft(),
    provider: sms.name,
    internet: internet.status(),
  };
}

// Puts a failed or waiting attendance text back in the queue, to the parent's current number.
function retry(id) {
  const msg = db.prepare('SELECT * FROM sms_messages WHERE id = ?').get(id);
  if (!msg) throw httpError(404, 'Text not found.');
  if (msg.status === 'sent' || msg.status === 'delivered') throw httpError(409, 'This text was already sent.');
  if (msg.status === 'sending') throw httpError(409, 'This text is being sent right now.');
  if (msg.kind === 'verification') {
    throw httpError(409, 'Verification codes are not resent from here. Send a new code on Verify numbers.');
  }
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(msg.student_id);
  if (!student?.guardian_mobile || !student.mobile_verified_at) {
    throw httpError(409, 'The parent\'s number is not verified. Verify it on Verify numbers first.');
  }
  db.prepare(`
    UPDATE sms_messages SET status = 'queued', to_mobile = ?, next_attempt_at = ?, last_error = NULL WHERE id = ?
  `).run(student.guardian_mobile, new Date().toISOString(), id);
  smsQueue.sendSoon();
  return { queued: true, to: student.guardian_mobile };
}

module.exports = { list, stats, retry };
