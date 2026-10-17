// Taps waiting to be uploaded to the server. (US-07)
// Every tap is written here FIRST, so it is never lost if the server, the network,
// or the power goes down. sync.js removes taps once the server confirms them.
const crypto = require('node:crypto');
const jsonFile = require('./jsonFile');

const FILE = 'outbox.json';
let taps = null;

function load() {
  if (!taps) taps = jsonFile.read(FILE, []);
  return taps;
}

function add(uid) {
  const tap = { clientTapId: crypto.randomUUID(), uid, tappedAt: new Date().toISOString() };
  load().push(tap);
  jsonFile.write(FILE, taps);
  return tap;
}

function pending() {
  return [...load()];
}

function remove(clientTapIds) {
  const done = new Set(clientTapIds);
  taps = load().filter((t) => !done.has(t.clientTapId));
  jsonFile.write(FILE, taps);
}

module.exports = { add, pending, remove };
