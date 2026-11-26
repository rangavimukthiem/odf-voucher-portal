import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const [rows] = await pool.execute(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
              u.username AS actor_username, u.full_name AS actor_name, u.role AS actor_role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ${limit}`
    );
    return res.json({ logs: rows });
  } catch (err) {
    return next(err);
  }
});

export default router;
