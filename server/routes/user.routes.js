import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';

const router = Router();

router.use(authenticate, requireRole('admin'));

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, full_name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    return res.json({ users: rows });
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = req.body?.role;

    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-40 chars (lowercase letters, digits, ., _, -).' });
    }
    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (!['admin', 'cashier'].includes(role)) {
      return res.status(400).json({ error: "Role must be 'admin' or 'cashier'." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (username, full_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [username, fullName, passwordHash, role]
    );

    await recordAudit({
      actorUserId: req.user.id,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: result.insertId,
      details: { username, role },
    });

    const [created] = await pool.execute(
      'SELECT id, username, full_name, role, is_active, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [result.insertId]
    );
    return res.status(201).json({ user: created[0] });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    return next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid user ID.' });

    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const target = rows[0];
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() || target.full_name : target.full_name;
    const role = req.body?.role && ['admin', 'cashier'].includes(req.body.role) ? req.body.role : target.role;
    const isActive =
      typeof req.body?.is_active === 'boolean' ? (req.body.is_active ? 1 : 0) : target.is_active;

    if (id === req.user.id && isActive === 0) {
      return res.status(400).json({ error: 'You cannot deactivate your own active administrator account.' });
    }
    if (id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot downgrade your own administrator role.' });
    }

    if (typeof req.body?.new_password === 'string' && req.body.new_password.length > 0) {
      if (req.body.new_password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
      }
      const passwordHash = await bcrypt.hash(req.body.new_password, 10);
      await pool.execute(
        'UPDATE users SET full_name = ?, role = ?, is_active = ?, password_hash = ? WHERE id = ?',
        [fullName, role, isActive, passwordHash, id]
      );
    } else {
      await pool.execute('UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?', [
        fullName,
        role,
        isActive,
        id,
      ]);
    }

    await recordAudit({
      actorUserId: req.user.id,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      details: { full_name: fullName, role, is_active: Boolean(isActive), password_reset: Boolean(req.body?.new_password) },
    });

    const [updated] = await pool.execute(
      'SELECT id, username, full_name, role, is_active, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return res.json({ user: updated[0] });
  } catch (err) {
    return next(err);
  }
});

export default router;
