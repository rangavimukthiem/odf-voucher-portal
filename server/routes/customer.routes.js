import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';
import { normalizePassport } from '../utils/validation.js';

const router = Router();

router.use(authenticate, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const queryText = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    let whereSql = '';
    const params = [];

    if (queryText) {
      const like = `%${queryText}%`;
      const normLike = `%${normalizePassport(queryText)}%`;
      whereSql = 'WHERE c.full_name LIKE ? OR c.passport_number LIKE ? OR c.email LIKE ? OR c.phone LIKE ?';
      params.push(like, normLike, like, like);
    }

    const [rows] = await pool.execute(
      `SELECT c.id, c.full_name, c.passport_number, c.nationality, c.phone, c.email,
              c.loyalty_points, c.notes, c.created_at, c.updated_at,
              COUNT(v.id) AS total_vouchers,
              SUM(CASE WHEN v.status = 'issued' THEN 1 ELSE 0 END) AS active_vouchers
       FROM customers c
       LEFT JOIN vouchers v ON v.customer_id = c.id
       ${whereSql}
       GROUP BY c.id
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return res.json({ customers: rows });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid customer ID.' });

    const [customers] = await pool.execute('SELECT * FROM customers WHERE id = ? LIMIT 1', [id]);
    if (customers.length === 0) {
      return res.status(404).json({ error: 'Passenger not found.' });
    }

    const [vouchers] = await pool.execute(
      `SELECT v.*, iu.full_name AS issued_by_name, cu.full_name AS claimed_by_name
       FROM vouchers v
       LEFT JOIN users iu ON iu.id = v.issued_by
       LEFT JOIN users cu ON cu.id = v.claimed_by
       WHERE v.customer_id = ?
       ORDER BY v.issued_at DESC`,
      [id]
    );

    return res.json({ customer: customers[0], vouchers });
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
    const passportNumber = normalizePassport(req.body?.passport_number || '');
    const nationality = typeof req.body?.nationality === 'string' ? req.body.nationality.trim() || null : null;
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() || null : null;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() || null : null;
    const loyaltyPoints = Number.parseInt(req.body?.loyalty_points ?? 0, 10);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() || null : null;

    if (!fullName || passportNumber.length < 4) {
      return res.status(400).json({ error: 'Passenger full name and valid passport number (min 4 chars) are required.' });
    }
    if (Number.isNaN(loyaltyPoints) || loyaltyPoints < 0) {
      return res.status(400).json({ error: 'Loyalty points must be a non-negative integer.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO customers (full_name, passport_number, nationality, phone, email, loyalty_points, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [fullName, passportNumber, nationality, phone, email, loyaltyPoints, notes, req.user.id]
    );

    await recordAudit({
      actorUserId: req.user.id,
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: result.insertId,
      details: { full_name: fullName, passport_number: passportNumber, loyalty_points: loyaltyPoints },
    });

    const [created] = await pool.execute('SELECT * FROM customers WHERE id = ? LIMIT 1', [result.insertId]);
    return res.status(201).json({ customer: created[0] });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A passenger with this passport number already exists.' });
    }
    return next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid customer ID.' });

    const [existingRows] = await pool.execute('SELECT * FROM customers WHERE id = ? LIMIT 1', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Passenger not found.' });
    }
    const existing = existingRows[0];

    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : existing.full_name;
    const passportNumber =
      req.body?.passport_number !== undefined
        ? normalizePassport(req.body.passport_number)
        : existing.passport_number;
    const nationality =
      req.body?.nationality !== undefined ? req.body.nationality?.trim() || null : existing.nationality;
    const phone = req.body?.phone !== undefined ? req.body.phone?.trim() || null : existing.phone;
    const email = req.body?.email !== undefined ? req.body.email?.trim() || null : existing.email;
    const loyaltyPoints =
      req.body?.loyalty_points !== undefined
        ? Number.parseInt(req.body.loyalty_points, 10)
        : existing.loyalty_points;
    const notes = req.body?.notes !== undefined ? req.body.notes?.trim() || null : existing.notes;

    if (!fullName || passportNumber.length < 4) {
      return res.status(400).json({ error: 'Passenger full name and valid passport number are required.' });
    }
    if (Number.isNaN(loyaltyPoints) || loyaltyPoints < 0) {
      return res.status(400).json({ error: 'Loyalty points must be a non-negative integer.' });
    }

    await pool.execute(
      `UPDATE customers
       SET full_name = ?, passport_number = ?, nationality = ?, phone = ?, email = ?, loyalty_points = ?, notes = ?
       WHERE id = ?`,
      [fullName, passportNumber, nationality, phone, email, loyaltyPoints, notes, id]
    );

    await recordAudit({
      actorUserId: req.user.id,
      action: 'CUSTOMER_UPDATED',
      entityType: 'customer',
      entityId: id,
      details: {
        full_name: fullName,
        passport_number: passportNumber,
        loyalty_points: loyaltyPoints,
      },
    });

    const [updated] = await pool.execute('SELECT * FROM customers WHERE id = ? LIMIT 1', [id]);
    return res.json({ customer: updated[0] });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Another passenger already uses this passport number.' });
    }
    return next(err);
  }
});

export default router;
