// Checks every minute whether the server can reach the internet, for the dashboard's status light.
// Taps are always saved locally; the internet only matters for sending texts.
const config = require('../config');

const CHECK_EVERY_MS = 60 * 1000;
let state = { online: null, checkedAt: null }; // online: null until the first check finishes

async function check() {
  let online;
  try {
    const res = await fetch(config.internetCheckUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    online = res.status < 500;
  } catch {
    online = false;
  }
  if (state.online !== null && online !== state.online) {
    console.log(online ? 'Internet is back.' : 'Internet is down. Texts will wait in the queue.');
  }
  state = { online, checkedAt: new Date().toISOString() };
}

function start() {
  check();
  setInterval(check, CHECK_EVERY_MS);
}

function status() {
  return state;
}

module.exports = { start, status };
