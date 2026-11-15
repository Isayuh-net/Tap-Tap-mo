// Every Excel file downloaded on Reports and files is also saved on the server PC, so the school
// keeps its own copy: <folder>/School year 2026-2027/Grade 11 - STEM A/<file>.xlsx
// Downloading the same report again replaces the old copy with the newer numbers.
// The folder is REPORTS_DIR in .env, or the one chosen on Reports and files (Change folder).
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const settings = require('./settings');
const { httpError } = require('../utils/httpError');

const folder = () => settings.get('reportsDir') ?? config.reportsDir;

// Characters Windows doesn't allow in file and folder names
const safeName = (name) => name.replace(/[<>:"/\\|?*]+/g, '-').trim();

// The school year a date belongs to: classes start in June, so Nov 2026 -> "2026-2027".
function schoolYear(date) {
  const [year, month] = date.split('-').map(Number);
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// Saves a file. Returns its path inside the folder, e.g. "School year 2026-2027/Grade 11 - STEM A/x.xlsx".
function save({ label, schoolYearDate, fileName }, buffer) {
  const relative = path.join(`School year ${schoolYear(schoolYearDate)}`, safeName(label), safeName(fileName));
  const target = path.join(folder(), relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(`${target}.tmp`, Buffer.from(buffer));
  fs.renameSync(`${target}.tmp`, target);
  return relative.split(path.sep).join('/');
}

const subfolders = (dir) => (fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : []);

// { folder, years: [{ name, sections: [{ name, files: [{ name, path, modified, size }] }] }] }, newest year first
function list() {
  const root = folder();
  const years = subfolders(root).filter((y) => y.startsWith('School year ')).sort().reverse().map((year) => ({
    name: year,
    sections: subfolders(path.join(root, year)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((section) => {
      const dir = path.join(root, year, section);
      const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx')).map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        return { name, path: `${year}/${section}/${name}`, modified: stat.mtime.toISOString(), size: stat.size };
      }).sort((a, b) => b.modified.localeCompare(a.modified));
      return { name: section, files };
    }).filter((s) => s.files.length),
  })).filter((y) => y.sections.length);
  return { folder: root, years };
}

// The full path of a saved file from its path in list(), refusing anything outside the folder.
function resolve(relative) {
  const root = path.resolve(folder());
  const file = path.resolve(root, String(relative ?? ''));
  if (!file.startsWith(root + path.sep) || !file.toLowerCase().endsWith('.xlsx') || !fs.existsSync(file)) {
    throw httpError(404, 'That file is no longer in the folder.');
  }
  return file;
}

// Changes the folder (admins). It must be a full path the server can write to.
function setFolder(dir) {
  const target = String(dir ?? '').trim();
  if (!target || !path.isAbsolute(target)) throw httpError(400, 'Enter the full path of a folder, for example C:\\Tap-Tap Mo\\Reports');
  try {
    fs.mkdirSync(target, { recursive: true });
    const probe = path.join(target, '.tap-tap-mo-check');
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
  } catch (err) {
    throw httpError(400, `The server can't save files in that folder (${err.code ?? err.message}).`);
  }
  settings.set('reportsDir', path.resolve(target));
  return list();
}

module.exports = { save, list, resolve, setFolder, schoolYear };
