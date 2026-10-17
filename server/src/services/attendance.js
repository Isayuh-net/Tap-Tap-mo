// Turns a card tap into an attendance record. (US-01, US-02, US-04, US-06, US-07)
//
// recordTap({ clientTapId, uid, gateId, tappedAt }) will:
//  1. Return the saved result if this clientTapId was already received (the gate re-sent it).
//  2. Find the active card and its student -> 'unregistered' or 'inactive' if not found.
//  3. Apply the cooldown: a tap within COOLDOWN_SECONDS of the student's last tap -> 'cooldown'.
//  4. Toggle: first tap of the school day, or a tap after a time out -> 'time_in'; otherwise 'time_out'.
//  5. Mark the first time in of the day as late if it is after LATE_AFTER.
//  6. Save the tap and, if the parent's number is verified, queue the text in sms_messages,
//     both in one transaction, so a tap is never saved without its text.
//
// It uses tappedAt from the gate, not the server's clock, so taps uploaded after an outage
// keep their real time. Taps from both gates must be processed in tappedAt order.

function recordTap() {
  throw new Error('recordTap is not implemented yet');
}

module.exports = { recordTap };
