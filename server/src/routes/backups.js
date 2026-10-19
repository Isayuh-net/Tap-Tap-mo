// Database backups (admin only).
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const backup = require('../services/backup');

const router = express.Router();
router.use(requireLogin('admin'));

// The newest backup: { dir, count, latest: { file, size, when, recent } | null }
router.get('/', (req, res) => res.json(backup.latest()));

// Make a backup now (for example before importing a big file).
router.post('/', async (req, res) => res.status(201).json(await backup.backupNow({ manual: true })));

module.exports = router;
