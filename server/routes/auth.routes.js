import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { authenticate, getJwtSecret } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, username, full_name, password_hash, role, is_active FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'User account is disabled. Contact an administrator.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, username: user.username },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    await recordAudit({
      actorUserId: user.id,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
      details: { username: user.username, role: user.role },
    });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', authenticate, (req, res) => {
  return res.json({ user: req.user });
});

router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const currentPassword = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
    const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';

    if (!currentPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Current password and a new password (min 8 chars) are required.' });
    }

    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    await recordAudit({
      actorUserId: req.user.id,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'user',
      entityId: req.user.id,
    });

    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    return next(err);
  }
});

export default router;
