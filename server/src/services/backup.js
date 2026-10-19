// Daily copies of the database in the backups folder (BACKUP_DIR in .env, which can be an external drive).
//  - One backup a day, made after BACKUP_TIME (default 6:00 PM), or right away when there is none yet
//    or the newest one is over a day old (for example, the server PC was off at backup time).
//  - db.backup() makes a safe copy while the server keeps running.
//  - Only the newest BACKUP_KEEP copies are kept.
// Backups contain students' and parents' personal data: keep the drive in a locked place.
// To restore: stop the server, copy a backup over data/tap-tap-mo.db, delete data/tap-tap-mo.db-wal and
// data/tap-tap-mo.db-shm if they exist, then start the server again.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const config = require('../config');
const { schoolDate, schoolTime } = require('../utils/time');

const PREFIX = 'tap-tap-mo-';
const CHECK_EVERY_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const { dir, time, keep } = config.backup;

// Backups, newest first: [{ file, size, at (Date) }]
function listBackups() {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
    .map((file) => {
      const stat = fs.statSync(path.join(dir, file));
      return { file, size: stat.size, at: stat.mtime };
    })
    .sort((a, b) => b.at - a.at);
}

function prune() {
  for (const old of listBackups().slice(keep)) fs.unlinkSync(path.join(dir, old.file));
}

// manual: true adds the time to the name, so it doesn't replace today's daily backup.
async function backupNow({ manual = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = manual ? `${schoolDate()}-${schoolTime().slice(0, 5).replace(':', '')}` : schoolDate();
  const target = path.join(dir, `${PREFIX}${stamp}.db`);
  // Write to a temporary name first, so a power cut never leaves a half-written backup.
  await db.backup(`${target}.tmp`);
  fs.renameSync(`${target}.tmp`, target);
  prune();
  return { file: path.basename(target), size: fs.statSync(target).size };
}

function isDue() {
  const backups = listBackups();
  if (backups.some((b) => b.file.startsWith(`${PREFIX}${schoolDate()}`))) return false; // already done today
  if (!backups.length || Date.now() - backups[0].at > DAY_MS) return true;
  return schoolTime() >= `${time}:00`;
}

async function checkAndBackup() {
  if (!isDue()) return;
  try {
    const { file } = await backupNow();
    console.log(`Backup saved: ${path.join(dir, file)}`);
  } catch (err) {
    console.error('Backup failed:', err.message);
  }
}

function start() {
  checkAndBackup();
  setInterval(checkAndBackup, CHECK_EVERY_MS);
}

// For the dashboard: the newest backup and whether it is recent enough.
function latest() {
  const [newest] = listBackups();
  return {
    dir,
    count: listBackups().length,
    latest: newest ? {
      file: newest.file,
      size: newest.size,
      when: newest.at.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      recent: Date.now() - newest.at < DAY_MS + 2 * 60 * 60 * 1000,
    } : null,
  };
}

module.exports = { start, backupNow, latest };
