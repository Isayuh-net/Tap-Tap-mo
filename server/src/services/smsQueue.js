// Sends queued texts in the background and retries failed ones. (US-01, US-02, US-03, US-11)
//
//  1. Taps never wait for SMS. recordTap() only adds a row to sms_messages with status 'queued'.
//  2. This worker picks queued rows whose next_attempt_at has passed, marks them 'sending',
//     and calls the SMS provider.
//  3. Success -> 'sent', then 'delivered' once the provider confirms delivery.
//     Temporary failure (no internet, provider down) -> back to 'queued' with a later
//     next_attempt_at, so texts from an outage go out automatically when the internet returns.
//     Permanent failure (invalid number) -> 'failed', listed on the dashboard.
//  4. On startup, rows stuck in 'sending' (the server was turned off mid-send) go back to 'queued'.
const db = require('../db');
const config = require('../config');
const sms = require('./sms');

const BATCH_SIZE = 20;
const CHECK_EVERY_MS = 2000;
const DELIVERY_CHECK_EVERY_MS = 30 * 1000;
const MAX_RETRY_DELAY_SECONDS = 5 * 60;

const nowIso = () => new Date().toISOString();

const dueMessages = db.prepare(`
  SELECT * FROM sms_messages
  WHERE status = 'queued' AND next_attempt_at <= ?
  ORDER BY id
  LIMIT ?
`);
const markSending = db.prepare("UPDATE sms_messages SET status = 'sending', attempts = attempts + 1 WHERE id = ?");
const markSent = db.prepare(`
  UPDATE sms_messages SET status = 'sent', provider_message_id = ?, sent_at = ?, last_error = NULL WHERE id = ?
`);
const markRetry = db.prepare("UPDATE sms_messages SET status = 'queued', next_attempt_at = ?, last_error = ? WHERE id = ?");
const markFailed = db.prepare("UPDATE sms_messages SET status = 'failed', last_error = ? WHERE id = ?");
const markDelivered = db.prepare("UPDATE sms_messages SET status = 'delivered', delivered_at = ? WHERE id = ?");
const resetStuck = db.prepare("UPDATE sms_messages SET status = 'queued' WHERE status = 'sending'");
const awaitingDelivery = db.prepare(`
  SELECT id, provider_message_id FROM sms_messages
  WHERE status = 'sent' AND provider_message_id IS NOT NULL AND sent_at > ?
  LIMIT 50
`);

// 60s, 120s, 240s, then every 5 minutes until the text goes through.
function retryDelaySeconds(attempts) {
  return Math.min(config.sms.retrySeconds * 2 ** (attempts - 1), MAX_RETRY_DELAY_SECONDS);
}

let sending = false;

async function sendDue() {
  if (sending) return;
  sending = true;
  try {
    let batch;
    while ((batch = dueMessages.all(nowIso(), BATCH_SIZE)).length) {
      for (const msg of batch) {
        markSending.run(msg.id);
        try {
          const { providerMessageId } = await sms.send({ to: msg.to_mobile, body: msg.body });
          markSent.run(providerMessageId, nowIso(), msg.id);
        } catch (err) {
          if (err.permanent) {
            markFailed.run(err.message, msg.id);
            continue;
          }
          const retryAt = new Date(Date.now() + retryDelaySeconds(msg.attempts + 1) * 1000).toISOString();
          markRetry.run(retryAt, err.message, msg.id);
          console.warn(`SMS ${msg.id} not sent (${err.message}), retrying at ${retryAt}`);
          // Probably no internet: stop here instead of failing every text in the queue.
          return;
        }
      }
    }
  } finally {
    sending = false;
  }
}

// Asks the provider whether sent texts reached the phone (texts from the last 24 hours).
async function checkDelivery() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  for (const msg of awaitingDelivery.all(since)) {
    try {
      const status = await sms.getStatus(msg.provider_message_id);
      if (status === 'delivered') markDelivered.run(nowIso(), msg.id);
      else if (status === 'failed') markFailed.run('Not delivered', msg.id);
    } catch {
      return; // provider unreachable, try again next time
    }
  }
}

function logError(err) {
  console.error('SMS queue error:', err);
}

// Send right away instead of waiting for the next check (called after a tap).
function sendSoon() {
  setImmediate(() => sendDue().catch(logError));
}

function start() {
  const stuck = resetStuck.run().changes;
  if (stuck) console.log(`SMS queue: ${stuck} text(s) interrupted by a restart were queued again`);
  console.log(`SMS queue: using the "${sms.name}" provider`);
  setInterval(() => sendDue().catch(logError), CHECK_EVERY_MS);
  setInterval(() => checkDelivery().catch(logError), DELIVERY_CHECK_EVERY_MS);
  sendSoon();
}

module.exports = { start, sendSoon };
