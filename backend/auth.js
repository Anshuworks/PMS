const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Requires ${role} role` });
    }
    next();
  };
}

// Requires an admin token whose adminRole is specifically 'superadmin', not
// just 'coordinator'. Use for actions like creating coordinator accounts.
function requireSuperadmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin' || req.user.adminRole !== 'superadmin') {
    return res.status(403).json({ error: 'Requires superadmin role' });
  }
  next();
}

// Requires an admin token whose adminRole is specifically 'coordinator', not
// 'superadmin'. Verifying student details is a coordinator-only task —
// superadmins can view the master database but not verify.
function requireCoordinator(req, res, next) {
  if (!req.user || req.user.role !== 'admin' || req.user.adminRole !== 'coordinator') {
    return res.status(403).json({ error: 'Only coordinators can perform this action' });
  }
  next();
}

module.exports = { signToken, authRequired, requireRole, requireSuperadmin, requireCoordinator, JWT_SECRET };
