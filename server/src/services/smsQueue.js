// Sends queued texts in the background and retries failed ones. (US-01, US-02, US-03, US-11)
//
// How it will work:
//  1. Taps never wait for SMS. recordTap() only adds a row to sms_messages with status 'queued'.
//  2. Every few seconds, this worker picks queued rows whose next_attempt_at has passed,
//     marks them 'sending', and calls the SMS provider.
//  3. Success -> 'sent', then 'delivered' once the provider confirms delivery.
//     Temporary failure (no internet, provider down) -> back to 'queued' with a later
//     next_attempt_at, so texts from an outage go out automatically when the internet returns.
//     Permanent failure (invalid number) or too many attempts -> 'failed', listed on the dashboard.
//  4. On startup, rows stuck in 'sending' (the server was turned off mid-send) go back to 'queued'.
const sms = require('./sms');

function start() {
  console.log(`SMS queue: using the "${sms.name}" provider (worker not built yet)`);
}

module.exports = { start };
