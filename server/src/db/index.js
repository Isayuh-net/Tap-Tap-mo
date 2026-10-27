// Opens the SQLite database and creates the tables on first run.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL'); // handles many writes during the morning rush
db.pragma('foreign_keys = ON');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Columns added after the first version. CREATE TABLE IF NOT EXISTS does not change a table
// that already exists, so older databases get the new columns here.
const studentColumns = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
if (!studentColumns.includes('strand')) {
  db.exec("ALTER TABLE students ADD COLUMN strand TEXT NOT NULL DEFAULT ''");
}
const codeColumns = db.prepare('PRAGMA table_info(verification_codes)').all().map((c) => c.name);
if (!codeColumns.includes('created_at')) {
  db.exec('ALTER TABLE verification_codes ADD COLUMN created_at TEXT'); // older codes stay NULL
}

// The allowed values in a CHECK can't be changed on an existing table. If a table's CHECK is older
// than schema.sql (it doesn't mention `newValue`), the table is rebuilt from schema.sql and every
// row is copied over, all in one transaction, so nothing is lost if it stops halfway.
function rebuildIfOutdated(table, newValue) {
  const current = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).sql;
  if (current.includes(newValue)) return;
  const definition = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`))[1];
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name).join(', ');
  db.pragma('foreign_keys = OFF'); // other tables point at this one while it is swapped
  try {
    db.transaction(() => {
      // the newline matters: the last column line may end with a -- comment
      db.exec(`CREATE TABLE ${table}_new (${definition}\n)`);
      db.exec(`INSERT INTO ${table}_new (${columns}) SELECT ${columns} FROM ${table}`);
      db.exec(`DROP TABLE ${table}`);
      db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  db.exec(schema); // puts back the table's indexes
  console.log(`Database: upgraded the ${table} table.`);
}
rebuildIfOutdated('taps', "'lunch_out'");
rebuildIfOutdated('sms_messages', "'lunch_late'");

const tapColumns = db.prepare('PRAGMA table_info(taps)').all().map((c) => c.name);
if (!tapColumns.includes('method')) {
  db.exec("ALTER TABLE taps ADD COLUMN method TEXT NOT NULL DEFAULT 'card'"); // older taps were all cards
}

module.exports = db;
