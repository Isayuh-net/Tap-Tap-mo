// Only registered gate apps may send taps. Each gate sends the X-Gate-Id and X-Gate-Key headers,
// which must match GATE_KEYS in .env.
const config = require('../config');

module.exports = function gateAuth(req, res, next) {
  const id = req.get('X-Gate-Id');
  const key = req.get('X-Gate-Key');
  if (!id || !key || config.gateKeys[id] !== key) {
    return res.status(401).json({ error: 'Unknown gate' });
  }
  req.gateId = id;
  next();
};
