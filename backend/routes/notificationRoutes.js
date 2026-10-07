const express = require('express');
const db = require('../db/db');
const { authRequired, requireRole } = require('../auth');

const router = express.Router();

// ---- Student: list own notifications, most recent first ----
router.get('/me', authRequired, requireRole('student'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT n.id, n.type, n.message, n.is_read, n.created_at,
            d.company, d.role
     FROM notifications n
     LEFT JOIN drives d ON d.id = n.drive_id
     WHERE n.student_id = $1
     ORDER BY n.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// ---- Student: unread count, for a badge in the nav ----
router.get('/me/unread-count', authRequired, requireRole('student'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int as count FROM notifications WHERE student_id = $1 AND is_read = FALSE`,
    [req.user.id]
  );
  res.json({ count: rows[0].count });
});

// ---- Student: mark one notification read ----
router.patch('/:id/read', authRequired, requireRole('student'), async (req, res) => {
  await db.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND student_id = $2`, [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ---- Student: mark all notifications read ----
router.patch('/read-all', authRequired, requireRole('student'), async (req, res) => {
  await db.query(`UPDATE notifications SET is_read = TRUE WHERE student_id = $1`, [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
