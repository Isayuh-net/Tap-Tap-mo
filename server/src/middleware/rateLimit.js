// Limits how often one computer (or one staff account) can call part of the API, so nobody can
// guess passwords across many usernames, flood the server, or use up SMS credits by clicking
// again and again. Counts are kept in memory and start over when the server restarts.
//   rateLimit({ windowMs, max, message, key, skip }) -> middleware
//   key(req):  who is counted (default: the computer's address)
//   skip(req): true for requests that aren't counted
function rateLimit({ windowMs, max, message, key = (req) => req.ip, skip = () => false }) {
  const hits = new Map(); // key -> times of recent requests

  // Forget old requests now and then, so the map doesn't grow.
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, times] of hits) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length) hits.set(k, recent);
      else hits.delete(k);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    if (skip(req)) return next();
    const now = Date.now();
    const k = key(req);
    const recent = (hits.get(k) ?? []).filter((t) => t > now - windowMs);
    if (recent.length >= max) {
      res.set('Retry-After', String(Math.ceil((recent[0] + windowMs - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    recent.push(now);
    hits.set(k, recent);
    next();
  };
}

module.exports = rateLimit;
