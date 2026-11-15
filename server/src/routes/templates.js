// School templates on Reports and files. Everyone can download them; admin and staff replace them.
const express = require('express');
const requireLogin = require('../middleware/requireLogin');
const templates = require('../services/templates');
const { httpError } = require('../utils/httpError');

const router = express.Router();
router.use(requireLogin());

// Reply: { templates: [{ kind, label, fileName, uploadedAt, size, builtIn }] }
router.get('/', (req, res) => res.json({ templates: templates.list() }));

router.get('/:kind', (req, res) => {
  const found = templates.file(req.params.kind);
  if (!found) throw httpError(404, 'No template uploaded yet.');
  res.download(found.file, found.fileName);
});

// Body: the file itself. Header X-File-Name: the file's name (URL-encoded).
router.put('/:kind', requireLogin('admin', 'staff'),
  express.raw({ type: () => true, limit: templates.MAX_BYTES }),
  (req, res) => {
    let fileName;
    try {
      fileName = decodeURIComponent(req.get('X-File-Name') ?? '');
    } catch {
      throw httpError(400, 'The file name could not be read.');
    }
    res.json(templates.save(req.params.kind, fileName, req.body));
  });

module.exports = router;
