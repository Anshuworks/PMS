const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { signToken, authRequired } = require('../auth');
const { sendMail } = require('../mailer');

const router = express.Router();

// ---- Student registration: minimal fields only. Everything else (academics,
// documents, etc.) is filled on the Profile page after first login. ----
router.post('/register/student', async (req, res) => {
  const { name, prn, branch, personal_email, phone, password } = req.body;

  if (!name || !prn || !branch || !personal_email || !phone || !password) {
    return res.status(400).json({ error: 'name, prn, branch, personal_email, phone, password are all required' });
  }

  try {
    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await db.query(
      `INSERT INTO students (name, prn, branch, personal_email, phone, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [name, prn, branch, personal_email, phone, password_hash]
    );
    const id = rows[0].id;
    const token = signToken({ id, role: 'student', name });
    res.json({ token, id });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'A student with this PRN already exists' });
    }
    res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
});

// ---- There is no public admin/coordinator registration endpoint.
// Coordinators are created only by a superadmin (see superadminRoutes.js,
// POST /api/superadmin/coordinators). The first-ever superadmin is created
// by running `node seedSuperadmin.js <name> <email> <password>` once,
// directly against the database. ----

// ---- Login: students log in with PRN, admins (coordinators/superadmins) log in with email ----
router.post('/login', async (req, res) => {
  const { identifier, password, role } = req.body; // identifier: PRN for students, email for admins
  if (!identifier || !password || !role) {
    return res.status(400).json({ error: 'identifier, password, role are required' });
  }

  const { rows } = role === 'admin'
    ? await db.query(`SELECT * FROM admins WHERE email = $1`, [identifier])
    : await db.query(`SELECT * FROM students WHERE prn = $1`, [identifier]);
  const user = rows[0];

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: `Invalid ${role === 'admin' ? 'email' : 'PRN'} or password` });
  }

  const token = signToken({
    id: user.id,
    role,
    name: user.name,
    ...(role === 'admin' ? { adminRole: user.role } : {}), // 'coordinator' or 'superadmin'
  });
  const { password_hash, resume_data, reset_otp, reset_otp_expires, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// ---- Whoever holds this token: fetch fresh identity from the DB. Used on
// every app load to correct any stale cached user data in localStorage
// (e.g. from before a field like adminRole existed) instead of trusting
// whatever was saved at login time. ----
router.get('/me', authRequired, async (req, res) => {
  if (req.user.role === 'admin') {
    const { rows } = await db.query(`SELECT id, name, email, role, created_at FROM admins WHERE id = $1`, [req.user.id]);
    const admin = rows[0];
    if (!admin) return res.status(404).json({ error: 'Not found' });
    // Spread FIRST, then override role/adminRole — admin.role holds the raw
    // db value ('coordinator' | 'superadmin'). If the override came before
    // the spread, admin.role would clobber the top-level 'admin' role used
    // for route protection.
    return res.json({ ...admin, role: 'admin', adminRole: admin.role });
  }
  const { rows } = await db.query(`SELECT * FROM students WHERE id = $1`, [req.user.id]);
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Not found' });
  const { password_hash: _ph, resume_data, reset_otp, reset_otp_expires, ...safe } = student;
  res.json({ role: 'student', ...safe });
});

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

// ---- Forgot password (step 1): student gives their PRN, admin gives their
// email. If an account matches, a 6-digit OTP is emailed to the registered
// address (college email for students, falling back to personal email) and
// expires in 10 minutes. Always returns the same generic response whether
// or not an account was found — this prevents the endpoint being used to
// check which PRNs/emails are registered. Requires SMTP to actually be
// configured (see mailer.js) — otherwise the OTP is only logged server-side. ----
router.post('/forgot-password', async (req, res) => {
  const { identifier, role } = req.body;
  if (!identifier || !role) {
    return res.status(400).json({ error: 'identifier and role are required' });
  }

  const table = role === 'admin' ? 'admins' : 'students';
  const lookupCol = role === 'admin' ? 'email' : 'prn';
  const { rows } = await db.query(`SELECT * FROM ${table} WHERE ${lookupCol} = $1`, [identifier]);
  const user = rows[0];

  const genericResponse = { ok: true, message: 'If that account exists, an OTP has been sent to the registered email.' };
  if (!user) return res.json(genericResponse);

  const otp = generateOtp();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await db.query(`UPDATE ${table} SET reset_otp = $1, reset_otp_expires = $2 WHERE id = $3`, [otp, expires, user.id]);

  const to = role === 'admin' ? user.email : (user.college_email || user.personal_email);
  if (to) {
    await sendMail(
      to,
      'Your password reset OTP',
      `Your one-time password reset code is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`
    );
  }

  res.json(genericResponse);
});

// ---- Forgot password (step 2): submit the OTP plus a new password. On
// success the old password is gone — replaced immediately, and the OTP is
// cleared so it can't be reused. ----
router.post('/reset-password', async (req, res) => {
  const { identifier, role, otp, newPassword } = req.body;
  if (!identifier || !role || !otp || !newPassword) {
    return res.status(400).json({ error: 'identifier, role, otp, newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
  }

  const table = role === 'admin' ? 'admins' : 'students';
  const lookupCol = role === 'admin' ? 'email' : 'prn';
  const { rows } = await db.query(`SELECT * FROM ${table} WHERE ${lookupCol} = $1`, [identifier]);
  const user = rows[0];

  const otpValid = user && user.reset_otp === otp && user.reset_otp_expires && new Date(user.reset_otp_expires) > new Date();
  if (!otpValid) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  const password_hash = bcrypt.hashSync(newPassword, 10);
  await db.query(`UPDATE ${table} SET password_hash = $1, reset_otp = NULL, reset_otp_expires = NULL WHERE id = $2`, [password_hash, user.id]);

  res.json({ ok: true, message: 'Password updated — you can now log in with your new password.' });
});

module.exports = router;
