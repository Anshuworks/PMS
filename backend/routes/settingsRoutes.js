const express = require('express');
const db = require('../db/db');
const { authRequired, requireRole } = require('../auth');

const router = express.Router();

// ---- Help contacts (TNP admin / department coordinator / TNP coordinator
// names + phone numbers). Any logged-in user can view; only admins
// (coordinator or superadmin) can maintain the list. ----
router.get('/help-contacts', authRequired, async (req, res) => {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'help_contacts'`);
  res.json({ contacts: rows[0]?.value ? JSON.parse(rows[0].value) : [] });
});

router.put('/help-contacts', authRequired, requireRole('admin'), async (req, res) => {
  const { contacts } = req.body;
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts must be an array' });
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('help_contacts', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(contacts)]
  );
  res.json({ ok: true });
});

module.exports = router;
