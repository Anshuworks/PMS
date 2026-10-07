const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { authRequired, requireSuperadmin } = require('../auth');
const { logAction } = require('../auditLog');

const router = express.Router();

// ---- Superadmin: create a coordinator account ----
router.post('/coordinators', authRequired, requireSuperadmin, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, password are required' });
  }
  try {
    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await db.query(
      `INSERT INTO admins (name, email, password_hash, role, created_by)
       VALUES ($1, $2, $3, 'coordinator', $4) RETURNING id`,
      [name, email, password_hash, req.user.id]
    );
    const id = rows[0].id;
    logAction(req.user, 'create_coordinator', 'coordinator', id, { name, email });
    res.json({ id });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'An admin with this email already exists' });
    }
    res.status(500).json({ error: 'Failed to create coordinator', detail: err.message });
  }
});

// ---- Superadmin: list all coordinators ----
router.get('/coordinators', authRequired, requireSuperadmin, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, email, role, created_at FROM admins WHERE role = 'coordinator' ORDER BY created_at DESC`
  );
  res.json(rows);
});

// ---- Superadmin: delete a coordinator account (e.g. when staff change
// over each academic year). Drives/announcements they created are
// automatically detached (ON DELETE SET NULL in the schema) rather than
// deleted, so nothing about past drives disappears. ----
router.delete('/coordinators/:id', authRequired, requireSuperadmin, async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM admins WHERE id = $1 AND role = 'coordinator'`, [req.params.id]);
  const coordinator = rows[0];
  if (!coordinator) return res.status(404).json({ error: 'Coordinator not found' });

  await db.query(`UPDATE students SET verified_by = NULL WHERE verified_by = $1`, [req.params.id]);
  await db.query(`DELETE FROM admins WHERE id = $1`, [req.params.id]);
  logAction(req.user, 'delete_coordinator', 'coordinator', Number(req.params.id), { name: coordinator.name, email: coordinator.email });
  res.json({ ok: true });
});

module.exports = router;
