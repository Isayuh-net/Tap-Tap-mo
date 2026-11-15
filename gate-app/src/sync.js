// Talks to the server in the background. (US-07)
//  - uploadNow(): sends every tap in the outbox, oldest first, to POST /api/gate/taps.
//    Taps the server answers for are removed from the outbox; the rest stay for the next try.
//    Returns the server's results, or null if the server could not be reached.
//  - Every few seconds: retry the upload, so taps saved during an outage go up automatically.
//  - Every few minutes: refresh the roster used to show names while offline, and download
//    student photos that are new or changed.
const config = require('./config');
const outbox = require('./outbox');
const roster = require('./roster');
const photos = require('./photos');

const RETRY_EVERY_MS = 5000;
const ROSTER_EVERY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 3000; // the student is waiting at the gate, so don't wait long
const BATCH_SIZE = 200;

const headers = {
  'Content-Type': 'application/json',
  'X-Gate-Id': config.gateId,
  'X-Gate-Key': config.gateKey,
};

async function request(path, options = {}) {
  const res = await fetch(`${config.serverUrl}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Server replied ${res.status} for ${path}`);
  return res.json();
}

async function upload() {
  const results = [];
  let pending;
  while ((pending = outbox.pending().slice(0, BATCH_SIZE)).length) {
    let reply;
    try {
      reply = await request('/api/gate/taps', { method: 'POST', body: JSON.stringify({ taps: pending }) });
    } catch (err) {
      console.warn(`Upload failed, ${outbox.pending().length} tap(s) kept in the outbox: ${err.message}`);
      return null;
    }
    outbox.remove(reply.results.map((r) => r.clientTapId));
    results.push(...reply.results);
    if (reply.results.length === 0) break; // nothing was accepted; avoid looping forever
  }
  return results;
}

// Uploads run one after another, so a tap made during an upload is sent in the next one.
let queue = Promise.resolve();

function uploadNow() {
  const run = queue.then(upload);
  queue = run.catch(() => null);
  return run;
}

async function refreshRoster() {
  try {
    const { cards, lrns } = await request('/api/gate/roster');
    roster.replace(cards, lrns);
    await refreshPhotos([...Object.values(cards), ...Object.values(lrns)]);
  } catch (err) {
    console.warn(`Roster not refreshed: ${err.message}`);
  }
}

async function downloadPhoto(studentId, version) {
  const res = await fetch(`${config.serverUrl}/api/gate/photos/${studentId}`, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Server replied ${res.status} for photo ${studentId}`);
  photos.save(studentId, version, Buffer.from(await res.arrayBuffer()));
}

// Downloads the photos this gate doesn't have yet, one at a time, and deletes ones no longer used.
// The first run downloads the whole school's photos (about 50 KB each), in the background.
let photosBusy = false; // the first run can take longer than ROSTER_EVERY_MS; don't start a second one
async function refreshPhotos(students) {
  if (photosBusy) return;
  photosBusy = true;
  try {
    const wanted = new Map(); // file name -> student
    for (const s of students) {
      if (s.studentId && s.photoVersion) wanted.set(photos.fileName(s.studentId, s.photoVersion), s);
    }
    photos.keepOnly(new Set(wanted.keys()));
    let failed = 0;
    for (const s of wanted.values()) {
      if (photos.has(s.studentId, s.photoVersion)) continue;
      await downloadPhoto(s.studentId, s.photoVersion).catch(() => { failed += 1; });
    }
    if (failed) console.warn(`${failed} photo(s) not downloaded; will try again at the next roster refresh`);
  } finally {
    photosBusy = false;
  }
}

// A student tapped whose photo this gate doesn't have yet (just uploaded): get it now if possible.
async function ensurePhoto(studentId, version) {
  if (!studentId || !version || photos.has(studentId, version)) return;
  await downloadPhoto(studentId, version).catch((err) => console.warn(`Photo not downloaded: ${err.message}`));
}

function uploadInBackground() {
  uploadNow().catch((err) => console.error('Upload error:', err));
}

function start() {
  uploadInBackground();
  refreshRoster();
  setInterval(uploadInBackground, RETRY_EVERY_MS);
  setInterval(refreshRoster, ROSTER_EVERY_MS);
}

module.exports = { start, uploadNow, ensurePhoto };
