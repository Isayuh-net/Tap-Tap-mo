// Nightly copy of the database to the backups folder or an external drive.
// better-sqlite3's db.backup(file) makes a safe copy while the server keeps running.
// Keep the last 30 copies, and copy one off-site now and then.

function scheduleNightlyBackup() {
  // not built yet
}

module.exports = { scheduleNightlyBackup };
