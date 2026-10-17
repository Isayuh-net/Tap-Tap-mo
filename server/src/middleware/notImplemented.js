// Placeholder handler for routes that are planned but not built yet.
module.exports = (req, res) => {
  res.status(501).json({ error: `Not implemented yet: ${req.method} ${req.originalUrl}` });
};
