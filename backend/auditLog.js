const db = require('./db/db');

/**
 * Records one admin action. Call this from any route where an admin
 * changes something that matters for accountability — never for read-only
 * actions. Never throws — a logging failure should never break the actual
 * operation it's describing, so callers don't need to await or catch this.
 *
 * @param {{id: number, name: string}} admin - typically req.user from the JWT
 * @param {string} action - short machine-readable label, e.g. 'verify_student'
 * @param {string} targetType - e.g. 'student', 'drive', 'coordinator'
 * @param {number|null} targetId
 * @param {object} [details] - anything action-specific, stored as JSONB
 */
async function logAction(admin, action, targetType, targetId, details) {
  try {
    await db.query(
      `INSERT INTO audit_log (actor_admin_id, actor_name, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [admin.id, admin.name, action, targetType, targetId ?? null, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAction };
