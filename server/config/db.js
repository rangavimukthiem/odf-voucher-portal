import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

function resolveDbConfig() {
  if (process.env.DATABASE_URL && !process.env.DB_HOST) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: parseInt(url.port, 10) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
    };
  }

  return {
    host: process.env.DB_HOST || 'ekafy-mariadb',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'ekafy_admin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'db_tenant_odf_voucher',
  };
}

const dbConfig = resolveDbConfig();

export const pool = mysql.createPool({
  ...dbConfig,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
});

/**
 * Runs idempotent schema setup and seeds an initial admin account if none exists.
 */
export async function initDatabase() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        username VARCHAR(80) NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'cashier') NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_username (username),
        KEY idx_users_role_active (role, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS customers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        full_name VARCHAR(150) NOT NULL,
        passport_number VARCHAR(50) NOT NULL,
        nationality VARCHAR(80) NULL,
        phone VARCHAR(40) NULL,
        email VARCHAR(150) NULL,
        loyalty_points INT UNSIGNED NOT NULL DEFAULT 0,
        notes TEXT NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_customers_passport (passport_number),
        KEY idx_customers_name (full_name),
        CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS vouchers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        voucher_code CHAR(6) NOT NULL,
        customer_id BIGINT UNSIGNED NOT NULL,
        points_redeemed INT UNSIGNED NOT NULL DEFAULT 0,
        voucher_value DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        currency CHAR(3) NOT NULL DEFAULT 'USD',
        status ENUM('issued', 'claimed', 'cancelled', 'expired') NOT NULL DEFAULT 'issued',
        issued_by BIGINT UNSIGNED NOT NULL,
        issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        claimed_by BIGINT UNSIGNED NULL,
        claimed_at DATETIME NULL,
        pos_receipt_ref VARCHAR(100) NULL,
        claim_notes VARCHAR(255) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_vouchers_code (voucher_code),
        KEY idx_vouchers_customer (customer_id),
        KEY idx_vouchers_status (status),
        KEY idx_vouchers_claimed_by (claimed_by),
        CONSTRAINT fk_vouchers_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        CONSTRAINT fk_vouchers_issued_by FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_vouchers_claimed_by FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        actor_user_id BIGINT UNSIGNED NULL,
        action VARCHAR(64) NOT NULL,
        entity_type VARCHAR(40) NOT NULL,
        entity_id BIGINT UNSIGNED NULL,
        details JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_audit_action_created (action, created_at),
        KEY idx_audit_actor (actor_user_id),
        CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await conn.execute(
      "SELECT COUNT(*) AS admin_count FROM users WHERE role = 'admin'"
    );
    if (rows[0].admin_count === 0) {
      const username = (process.env.SEED_ADMIN_USERNAME || 'admin').trim().toLowerCase();
      const fullName = (process.env.SEED_ADMIN_NAME || 'Operations Administrator').trim();
      const rawPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMeNow123!';
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      await conn.execute(
        'INSERT INTO users (username, full_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
        [username, fullName, passwordHash, 'admin']
      );
      console.log(`[db] Seeded initial admin user "${username}". Change default password after first login.`);
    }
  } finally {
    conn.release();
  }
}
