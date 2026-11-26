import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to at least 16 characters in production.');
  }
  return 'dev_only_fallback_secret_change_in_prod';
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
