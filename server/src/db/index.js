// Opens the SQLite database and creates the tables on first run.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL'); // handles many writes during the morning rush
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Columns added after the first version. CREATE TABLE IF NOT EXISTS does not change a table
// that already exists, so older databases get the new columns here.
const studentColumns = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
if (!studentColumns.includes('strand')) {
  db.exec("ALTER TABLE students ADD COLUMN strand TEXT NOT NULL DEFAULT ''");
}

module.exports = db;
