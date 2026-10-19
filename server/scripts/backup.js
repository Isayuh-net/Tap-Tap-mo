// Makes a backup of the database right now. Safe to run while the server is running.
// Usage: npm run backup
const path = require('node:path');
const config = require('../src/config');
const backup = require('../src/services/backup');

backup.backupNow({ manual: true })
  .then(({ file, size }) => console.log(`Backup saved: ${path.join(config.backup.dir, file)} (${Math.round(size / 1024)} KB)`))
  .catch((err) => {
    console.error('Backup failed:', err.message);
    process.exit(1);
  });
