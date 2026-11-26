import { pool } from '../config/db.js';

/**
 * Writes an immutable audit log entry; accepts an optional transaction connection.
 */
export async function recordAudit(
  { actorUserId = null, action, entityType, entityId = null, details = null },
  conn = pool
) {
  const serialized = details ? JSON.stringify(details) : null;
  await conn.execute(
    'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [actorUserId, action, entityType, entityId, serialized]
  );
}
