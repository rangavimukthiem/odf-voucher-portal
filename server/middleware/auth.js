import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { pool } from '../config/db.js';

let _runtimeSecret = null;

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;

  // Auto-generate a per-process secret so the app starts without crashing.
  // ⚠ WARNING: all sessions are invalidated on every container restart until
  // you set JWT_SECRET in your EKAFY tenant environment variables.
  if (!_runtimeSecret) {
    _runtimeSecret = randomBytes(32).toString('hex');
    console.warn(
      '[odf-voucher-portal] WARNING: JWT_SECRET is not set. ' +
      'A temporary secret has been generated for this process. ' +
      'All sessions will be invalidated on the next restart. ' +
      'Set JWT_SECRET in your EKAFY tenant environment variables to fix this.'
    );
  }
  return _runtimeSecret;
}

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = jwt.verify(token, getJwtSecret());
    const [rows] = await pool.execute(
      'SELECT id, username, full_name, role, is_active FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ error: 'Account inactive or not found' });
    }

    req.user = {
      id: rows[0].id,
      username: rows[0].username,
      full_name: rows[0].full_name,
      role: rows[0].role,
    };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }
    return next(err);
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    return next();
  };
}
