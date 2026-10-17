// Protects dashboard routes. Pass roles to limit access, e.g. requireLogin('admin', 'staff').
module.exports = (...roles) => (req, res, next) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'Login required' });
  if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Not allowed' });
  req.user = user;
  next();
};
