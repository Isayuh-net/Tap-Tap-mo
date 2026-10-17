// Read and write small JSON files in Electron's user data folder.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

function filePath(name) {
  return path.join(app.getPath('userData'), name);
}

function read(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch {
    return fallback;
  }
}

// Write to a temporary file, then rename it over the old one,
// so a power cut can never leave a half-written file.
function write(name, data) {
  const file = filePath(name);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
  fs.renameSync(`${file}.tmp`, file);
}

module.exports = { read, write };
