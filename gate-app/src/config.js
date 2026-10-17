// Gate settings. Copy config.example.json to config.json and set the server address, gate id and key
// (they must match GATE_KEYS in the server's .env). Set "kiosk": true on the real gate PCs.
// An installed app reads config.json from its user data folder first.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const defaults = require('../config.example.json');

function load() {
  const candidates = [
    path.join(app.getPath('userData'), 'config.json'),
    path.join(__dirname, '..', 'config.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  }
  console.warn('config.json not found, using config.example.json');
  return defaults;
}

module.exports = load();
