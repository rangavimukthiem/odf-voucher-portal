import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';
import {
  isValidSixDigitCode,
  maskPassport,
  matchesPassportVerification,
  resolveVoucherStatus,
} from '../utils/validation.js';

const router = Router();

router.use(authenticate);

function formatVoucherRow(row, role) {
  const effectiveStatus = resolveVoucherStatus(row);
  return {
    id: row.id,
    voucher_code: row.voucher_code,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    customer_passport: role === 'admin' ? row.passport_number : maskPassport(row.passport_number),
    customer_nationality: row.nationality,
    customer_loyalty_points: row.customer_loyalty_points,
    points_redeemed: row.points_redeemed,
    voucher_value: Number(row.voucher_value),
    currency: row.currency,
    status: effectiveStatus,
    issued_by: row.issued_by,
    issued_by_name: row.issued_by_name,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    claimed_by: row.claimed_by,
    claimed_by_name: row.claimed_by_name,
    claimed_at: row.claimed_at,
    pos_receipt_ref: row.pos_receipt_ref,
    claim_notes: row.claim_notes,
  };
}

router.get('/stats', requireRole('admin'), async (_req, res, next) => {
  try {
    const [[voucherStats]] = await pool.execute(`
      SELECT
        COUNT(*) AS total_vouchers,
        SUM(CASE WHEN status = 'issued' AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 ELSE 0 END) AS issued_count,
        COALESCE(SUM(CASE WHEN status = 'issued' AND (expires_at IS NULL OR expires_at > NOW()) THEN voucher_value ELSE 0 END), 0) AS issued_value,
        SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) AS claimed_count,
        COALESCE(SUM(CASE WHEN status = 'claimed' THEN voucher_value ELSE 0 END), 0) AS claimed_value,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
        SUM(CASE WHEN status = 'expired' OR (status = 'issued' AND expires_at IS NOT NULL AND expires_at <= NOW()) THEN 1 ELSE 0 END) AS expired_count
      FROM vouchers
    `);

    const [[customerStats]] = await pool.execute('SELECT COUNT(*) AS total_customers FROM customers');

    return res.json({
      stats: {
        total_customers: Number(customerStats.total_customers || 0),
        total_vouchers: Number(voucherStats.total_vouchers || 0),
        issued_count: Number(voucherStats.issued_count || 0),
        issued_value: Number(voucherStats.issued_value || 0),
        claimed_count: Number(voucherStats.claimed_count || 0),
        claimed_value: Number(voucherStats.claimed_value || 0),
        cancelled_count: Number(voucherStats.cancelled_count || 0),
        expired_count: Number(voucherStats.expired_count || 0),
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const queryText = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const conditions = [];
    const params = [];

    if (req.user.role === 'cashier') {
      conditions.push('v.claimed_by = ?');
      params.push(req.user.id);
    } else if (statusFilter && ['issued', 'claimed', 'cancelled', 'expired'].includes(statusFilter)) {
      if (statusFilter === 'expired') {
        conditions.push("(v.status = 'expired' OR (v.status = 'issued' AND v.expires_at IS NOT NULL AND v.expires_at <= NOW()))");
      } else if (statusFilter === 'issued') {
        conditions.push("v.status = 'issued' AND (v.expires_at IS NULL OR v.expires_at > NOW())");
      } else {
        conditions.push('v.status = ?');
        params.push(statusFilter);
      }
    }

    if (queryText) {
      const like = `%${queryText}%`;
      if (req.user.role === 'admin') {
        conditions.push('(v.voucher_code LIKE ? OR c.full_name LIKE ? OR c.passport_number LIKE ? OR v.pos_receipt_ref LIKE ?)');
        params.push(like, like, like.toUpperCase(), like);
      } else {
        conditions.push('(v.voucher_code LIKE ? OR c.full_name LIKE ? OR v.pos_receipt_ref LIKE ?)');
        params.push(like, like, like);
      }
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = req.user.role === 'cashier' ? 'ORDER BY v.claimed_at DESC, v.id DESC' : 'ORDER BY v.issued_at DESC, v.id DESC';

    const [rows] = await pool.execute(
      `SELECT v.*, c.full_name AS customer_name, c.passport_number, c.nationality,
              c.loyalty_points AS customer_loyalty_points,
              iu.full_name AS issued_by_name, cu.full_name AS claimed_by_name
       FROM vouchers v
       INNER JOIN customers c ON c.id = v.customer_id
       LEFT JOIN users iu ON iu.id = v.issued_by
       LEFT JOIN users cu ON cu.id = v.claimed_by
       ${whereSql}
       ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return res.json({
      vouchers: rows.map((row) => formatVoucherRow(row, req.user.role)),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/lookup/:code', async (req, res, next) => {
  try {
    const code = (req.params.code || '').trim();
    if (!isValidSixDigitCode(code)) {
      return res.status(400).json({ error: 'Voucher number must be exactly 6 digits.' });
    }

    const [rows] = await pool.execute(
      `SELECT v.*, c.full_name AS customer_name, c.passport_number, c.nationality,
              c.loyalty_points AS customer_loyalty_points,
              iu.full_name AS issued_by_name, cu.full_name AS claimed_by_name
       FROM vouchers v
       INNER JOIN customers c ON c.id = v.customer_id
       LEFT JOIN users iu ON iu.id = v.issued_by
       LEFT JOIN users cu ON cu.id = v.claimed_by
       WHERE v.voucher_code = ?
       LIMIT 1`,
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: `No voucher found with code ${code}.` });
    }

    return res.json({ voucher: formatVoucherRow(rows[0], req.user.role) });
  } catch (err) {
    return next(err);
  }
});

/**
 * Admin-only: manually assign a 6-digit voucher from the operations sheet to a passenger.
 */
router.post('/', requireRole('admin'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const voucherCode = typeof req.body?.voucher_code === 'string' ? req.body.voucher_code.trim() : '';
    const customerId = Number.parseInt(req.body?.customer_id, 10);
    const pointsRedeemed = Number.parseInt(req.body?.points_redeemed ?? 0, 10);
    const voucherValue = Number.parseFloat(req.body?.voucher_value);
    const currency =
      typeof req.body?.currency === 'string' && /^[A-Za-z]{3}$/.test(req.body.currency.trim())
        ? req.body.currency.trim().toUpperCase()
        : (process.env.DEFAULT_CURRENCY || 'USD').toUpperCase();
    const expiresAtRaw = req.body?.expires_at ? String(req.body.expires_at).trim() : '';

    if (!isValidSixDigitCode(voucherCode)) {
      return res.status(400).json({ error: 'Voucher number must be strictly 6 digits (e.g. 048291).' });
    }
    if (!customerId || customerId < 1) {
      return res.status(400).json({ error: 'Valid passenger selection is required.' });
    }
    if (Number.isNaN(pointsRedeemed) || pointsRedeemed < 0) {
      return res.status(400).json({ error: 'Loyalty points must be zero or a positive integer.' });
    }
    if (Number.isNaN(voucherValue) || voucherValue <= 0) {
      return res.status(400).json({ error: 'Voucher monetary value must be greater than 0.' });
    }

    let expiresAtSql = null;
    if (expiresAtRaw) {
      const parsed = new Date(expiresAtRaw);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Invalid expiry date format.' });
      }
      if (parsed.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'Expiry date must be in the future.' });
      }
      expiresAtSql = parsed.toISOString().slice(0, 19).replace('T', ' ');
    }

    await conn.beginTransaction();

    const [customers] = await conn.execute(
      'SELECT id, full_name, passport_number, loyalty_points FROM customers WHERE id = ? LIMIT 1',
      [customerId]
    );
    if (customers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Selected passenger does not exist.' });
    }

    const [existingCode] = await conn.execute(
      'SELECT id FROM vouchers WHERE voucher_code = ? LIMIT 1',
      [voucherCode]
    );
    if (existingCode.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: `Voucher number ${voucherCode} is already assigned.` });
    }

    const [insertResult] = await conn.execute(
      `INSERT INTO vouchers (voucher_code, customer_id, points_redeemed, voucher_value, currency, status, issued_by, expires_at)
       VALUES (?, ?, ?, ?, ?, 'issued', ?, ?)`,
      [voucherCode, customerId, pointsRedeemed, voucherValue.toFixed(2), currency, req.user.id, expiresAtSql]
    );

    await recordAudit(
      {
        actorUserId: req.user.id,
        action: 'VOUCHER_ISSUED',
        entityType: 'voucher',
        entityId: insertResult.insertId,
        details: {
          voucher_code: voucherCode,
          customer_id: customerId,
          customer_name: customers[0].full_name,
          points_redeemed: pointsRedeemed,
          voucher_value: Number(voucherValue.toFixed(2)),
          currency,
        },
      },
      conn
    );

    await conn.commit();

    const [rows] = await pool.execute(
      `SELECT v.*, c.full_name AS customer_name, c.passport_number, c.nationality,
              c.loyalty_points AS customer_loyalty_points,
              iu.full_name AS issued_by_name, cu.full_name AS claimed_by_name
       FROM vouchers v
       INNER JOIN customers c ON c.id = v.customer_id
       LEFT JOIN users iu ON iu.id = v.issued_by
       LEFT JOIN users cu ON cu.id = v.claimed_by
       WHERE v.id = ? LIMIT 1`,
      [insertResult.insertId]
    );

    return res.status(201).json({ voucher: formatVoucherRow(rows[0], req.user.role) });
  } catch (err) {
    await conn.rollback();
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That 6-digit voucher number is already assigned.' });
    }
    return next(err);
  } finally {
    conn.release();
  }
});

/**
 * Cashier-only: atomically claim an active 6-digit voucher after verifying passenger passport.
 */
router.post('/:code/claim', requireRole('cashier'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const code = (req.params.code || '').trim();
    const passportVerification = typeof req.body?.passport_verification === 'string' ? req.body.passport_verification : '';
    const posReceiptRef = typeof req.body?.pos_receipt_ref === 'string' ? req.body.pos_receipt_ref.trim() || null : null;
    const claimNotes = typeof req.body?.claim_notes === 'string' ? req.body.claim_notes.trim() || null : null;

    if (!isValidSixDigitCode(code)) {
      return res.status(400).json({ error: 'Voucher number must be exactly 6 digits.' });
    }
    if (!passportVerification.trim()) {
      return res.status(400).json({ error: 'Enter passenger full passport number or last 4 characters to verify.' });
    }

    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT v.*, c.full_name AS customer_name, c.passport_number
       FROM vouchers v
       INNER JOIN customers c ON c.id = v.customer_id
       WHERE v.voucher_code = ?
       FOR UPDATE`,
      [code]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: `Voucher ${code} not found.` });
    }

    const voucher = rows[0];
    const effectiveStatus = resolveVoucherStatus(voucher);

    if (effectiveStatus === 'claimed') {
      await conn.rollback();
      return res.status(409).json({ error: `Voucher ${code} has already been claimed.` });
    }
    if (effectiveStatus === 'cancelled') {
      await conn.rollback();
      return res.status(409).json({ error: `Voucher ${code} has been cancelled and cannot be claimed.` });
    }
    if (effectiveStatus === 'expired') {
      await conn.execute("UPDATE vouchers SET status = 'expired' WHERE id = ? AND status = 'issued'", [voucher.id]);
      await conn.commit();
      return res.status(409).json({ error: `Voucher ${code} has expired.` });
    }

    if (!matchesPassportVerification(voucher.passport_number, passportVerification)) {
      await conn.rollback();
      return res.status(403).json({
        error: 'Passport verification failed. Confirm the full passport number or last 4 characters.',
      });
    }

    await conn.execute(
      `UPDATE vouchers
       SET status = 'claimed', claimed_by = ?, claimed_at = NOW(), pos_receipt_ref = ?, claim_notes = ?
       WHERE id = ? AND status = 'issued'`,
      [req.user.id, posReceiptRef, claimNotes, voucher.id]
    );

    await recordAudit(
      {
        actorUserId: req.user.id,
        action: 'VOUCHER_CLAIMED',
        entityType: 'voucher',
        entityId: voucher.id,
        details: {
          voucher_code: code,
          customer_id: voucher.customer_id,
          voucher_value: Number(voucher.voucher_value),
          currency: voucher.currency,
          pos_receipt_ref: posReceiptRef,
        },
      },
      conn
    );

    await conn.commit();

    const [updatedRows] = await pool.execute(
      `SELECT v.*, c.full_name AS customer_name, c.passport_number, c.nationality,
              c.loyalty_points AS customer_loyalty_points,
              iu.full_name AS issued_by_name, cu.full_name AS claimed_by_name
       FROM vouchers v
       INNER JOIN customers c ON c.id = v.customer_id
       LEFT JOIN users iu ON iu.id = v.issued_by
       LEFT JOIN users cu ON cu.id = v.claimed_by
       WHERE v.id = ? LIMIT 1`,
      [voucher.id]
    );

    return res.json({
      message: `Voucher ${code} successfully claimed.`,
      voucher: formatVoucherRow(updatedRows[0], req.user.role),
    });
  } catch (err) {
    await conn.rollback();
    return next(err);
  } finally {
    conn.release();
  }
});

/**
 * Admin-only: void an un-claimed voucher.
 */
router.post('/:code/cancel', requireRole('admin'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const code = (req.params.code || '').trim();
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null;

    if (!isValidSixDigitCode(code)) {
      return res.status(400).json({ error: 'Voucher number must be exactly 6 digits.' });
    }

    await conn.beginTransaction();

    const [rows] = await conn.execute('SELECT * FROM vouchers WHERE voucher_code = ? FOR UPDATE', [code]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: `Voucher ${code} not found.` });
    }

    const voucher = rows[0];
    if (voucher.status !== 'issued') {
      await conn.rollback();
      return res.status(409).json({ error: `Only active issued vouchers can be cancelled (current: ${voucher.status}).` });
    }

    await conn.execute(
      "UPDATE vouchers SET status = 'cancelled', claim_notes = ? WHERE id = ?",
      [reason || 'Cancelled by administrator', voucher.id]
    );

    await recordAudit(
      {
        actorUserId: req.user.id,
        action: 'VOUCHER_CANCELLED',
        entityType: 'voucher',
        entityId: voucher.id,
        details: { voucher_code: code, reason },
      },
      conn
    );

    await conn.commit();
    return res.json({ message: `Voucher ${code} cancelled.` });
  } catch (err) {
    await conn.rollback();
    return next(err);
  } finally {
    conn.release();
  }
});

export default router;
