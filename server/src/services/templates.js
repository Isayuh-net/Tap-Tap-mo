// School templates kept on Reports and files: the SF2 form and the student list for importing.
// When the school sends a new version, staff replace the file, and every download gives the new one.
// Files are saved in TEMPLATES_DIR as <kind><extension>; the original file name is kept in settings.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const settings = require('./settings');
const { httpError } = require('../utils/httpError');

const KINDS = {
  sf2: { label: 'SF2 attendance form' },
  students: {
    label: 'Student list for import',
    // Until the school uploads its own, the built-in CSV template is used.
    builtIn: { file: path.join(__dirname, '..', '..', 'public', 'templates', 'students-template.csv'), fileName: 'students-template.csv' },
  },
};
const EXTENSIONS = ['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc'];
const MAX_BYTES = 10 * 1024 * 1024;

function requireKind(kind) {
  if (!KINDS[kind]) throw httpError(404, 'Unknown template.');
}

// [{ kind, label, fileName, uploadedAt, size, builtIn }]; fileName is null when there's nothing to download
function list() {
  return Object.entries(KINDS).map(([kind, k]) => {
    const saved = settings.get(`template:${kind}`);
    if (saved) return { kind, label: k.label, fileName: saved.fileName, uploadedAt: saved.uploadedAt, size: saved.size, builtIn: false };
    return { kind, label: k.label, fileName: k.builtIn?.fileName ?? null, uploadedAt: null, size: null, builtIn: Boolean(k.builtIn) };
  });
}

// Saves an uploaded template (a Buffer) in place of the old one.
function save(kind, fileName, data) {
  requireKind(kind);
  const name = path.basename(String(fileName ?? '')).trim();
  const ext = path.extname(name).toLowerCase();
  if (!name || !EXTENSIONS.includes(ext)) throw httpError(400, `Upload an Excel, CSV, Word or PDF file (${EXTENSIONS.join(', ')}).`);
  if (!Buffer.isBuffer(data) || !data.length) throw httpError(400, 'Choose a file to upload.');
  if (data.length > MAX_BYTES) throw httpError(400, 'The file is too large (10 MB at most).');

  fs.mkdirSync(config.templatesDir, { recursive: true });
  const storedAs = `${kind}${ext}`;
  fs.writeFileSync(path.join(config.templatesDir, `${storedAs}.tmp`), data);
  fs.renameSync(path.join(config.templatesDir, `${storedAs}.tmp`), path.join(config.templatesDir, storedAs));
  const old = settings.get(`template:${kind}`);
  if (old && old.storedAs !== storedAs) fs.rmSync(path.join(config.templatesDir, old.storedAs), { force: true });
  settings.set(`template:${kind}`, { fileName: name, storedAs, size: data.length, uploadedAt: new Date().toISOString() });
  return list().find((t) => t.kind === kind);
}

// { file, fileName } to download, or null when nothing was uploaded and there's no built-in one
function file(kind) {
  requireKind(kind);
  const saved = settings.get(`template:${kind}`);
  if (saved) {
    const stored = path.join(config.templatesDir, saved.storedAs);
    if (fs.existsSync(stored)) return { file: stored, fileName: saved.fileName };
  }
  return KINDS[kind].builtIn ?? null;
}

module.exports = { list, save, file, MAX_BYTES };
