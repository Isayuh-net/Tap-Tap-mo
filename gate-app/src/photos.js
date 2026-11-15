// Student photos for the gate screen, kept in the user data folder so they still show when the
// server can't be reached. sync.js downloads new and changed photos after each roster refresh.
// Files are named <studentId>-<photoVersion>.jpg, so a changed photo is a new file.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const dir = () => path.join(app.getPath('userData'), 'photos');
const fileName = (studentId, version) => `${Number(studentId)}-${Number(version)}.jpg`;
const filePath = (studentId, version) => path.join(dir(), fileName(studentId, version));

function has(studentId, version) {
  return fs.existsSync(filePath(studentId, version));
}

// Write to a temporary file, then rename it, so a power cut never leaves a half-written photo.
function save(studentId, version, data) {
  fs.mkdirSync(dir(), { recursive: true });
  const file = filePath(studentId, version);
  fs.writeFileSync(`${file}.tmp`, data);
  fs.renameSync(`${file}.tmp`, file);
}

// The photo as a data: address the gate screen can show, or null if this gate doesn't have it.
function dataUrl(studentId, version) {
  if (!studentId || !version) return null;
  try {
    return `data:image/jpeg;base64,${fs.readFileSync(filePath(studentId, version)).toString('base64')}`;
  } catch {
    return null;
  }
}

// Deletes every photo not in `wanted` (a Set of file names): old versions, removed photos, students who left.
function keepOnly(wanted) {
  if (!fs.existsSync(dir())) return;
  for (const file of fs.readdirSync(dir())) {
    if (!wanted.has(file)) fs.rmSync(path.join(dir(), file), { force: true });
  }
}

module.exports = { fileName, has, save, dataUrl, keepOnly };
