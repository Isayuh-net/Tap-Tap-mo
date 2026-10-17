// Talks to the server in the background. (US-07)
//
// How it will work:
//  - uploadNow(): sends every tap in the outbox, oldest first, to POST /api/gate/taps with the
//    X-Gate-Id and X-Gate-Key headers. Taps the server confirms are removed from the outbox;
//    the rest stay there for the next try. Returns the server's results, or null if offline.
//  - Every few seconds: retry the upload, so taps saved during an outage go up automatically.
//  - Every few minutes: refresh the roster from GET /api/gate/roster.

function start() {
  // not built yet
}

async function uploadNow() {
  return null; // not built yet: always "offline"
}

module.exports = { start, uploadNow };
