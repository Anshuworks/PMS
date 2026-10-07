const express = require('express');
const db = require('../db/db');
const { authRequired, requireRole, requireCoordinator, requireSuperadmin } = require('../auth');
const { computeCgpa, profileCompletion } = require('../profileHelpers');
const { logAction } = require('../auditLog');
const { Parser } = require('json2csv');

const router = express.Router();

// ---- Admin: master list of every student, with computed CGPA and
// completion/verification/placement status. ----
router.get('/students', authRequired, requireRole('admin'), async (req, res) => {
  const { rows: students } = await db.query(`SELECT * FROM students ORDER BY name`);
  const withDerived = [];
  for (const s of students) {
    const { password_hash, resume_data, ...safe } = s;
    const { complete, missing } = profileCompletion(s);
    const { rows: placedRows } = await db.query(
      `SELECT COUNT(*)::int as count FROM applications WHERE student_id = $1 AND status = 'Selected'`,
      [s.id]
    );
    withDerived.push({ ...safe, cgpa: computeCgpa(s), profileComplete: complete, missingFields: missing, isPlaced: placedRows[0].count > 0 });
  }
  res.json(withDerived);
});

// ---- Admin: export the full master sheet (all students, all fields the
// college needs internally — NOT the same as the per-drive company export). ----
router.get('/students/export', authRequired, requireRole('admin'), async (req, res) => {
  const { rows: students } = await db.query(`SELECT * FROM students ORDER BY name`);

  const rows = students.map((s) => {
    const cgpa = computeCgpa(s);
    return {
      full_name: s.name,
      gender: s.gender,
      dob: s.dob,
      age: s.age,
      branch: s.branch,
      prn: s.prn,
      personal_email: s.personal_email,
      college_email: s.college_email,
      appearing_for: s.appearing_for,
      contact_number: s.phone,
      whatsapp_number: s.whatsapp_number,
      aadhar_no: s.aadhar_no,
      pan_no: s.pan_no,
      tenth_board: s.tenth_board,
      tenth_passing_year: s.tenth_passing_year,
      tenth_percentage: s.tenth_percentage,
      twelfth_or_diploma_type: s.twelfth_or_diploma_type,
      twelfth_or_diploma_board_or_college: s.twelfth_or_diploma_name,
      twelfth_or_diploma_percentage: s.twelfth_or_diploma_percentage,
      twelfth_or_diploma_passing_year: s.twelfth_passing_year,
      sem1_sgpa: s.sem1_sgpa,
      sem2_sgpa: s.sem2_sgpa,
      sem3_sgpa: s.sem3_sgpa,
      sem4_sgpa: s.sem4_sgpa,
      sem5_sgpa: s.sem5_sgpa,
      sem6_sgpa: s.sem6_sgpa,
      aggregate_cgpa: cgpa,
      active_backlogs: s.backlogs_active,
      dead_backlogs: s.backlogs_dead,
      years_of_gap: s.year_gap,
      gap_reason: s.year_gap && s.year_gap > 0 ? (s.year_gap_reason || '') : 'NA',
      current_address: s.current_address,
      permanent_address: s.permanent_address,
      parent_name: s.parent_name,
      parent_contact_number: s.parent_contact_number,
      parent_email: s.parent_email,
      profile_locked: s.profile_locked,
      verified: s.verified,
    };
  });

  const parser = new Parser();
  const csv = parser.parse(rows.length ? rows : [{ note: 'No students yet' }]);
  res.header('Content-Type', 'text/csv');
  res.attachment('master-sheet.csv');
  res.send(csv);
});

// ---- Admin: override any profile field directly, bypassing the student's
// own lock entirely. Use this for corrections after results are announced
// late (e.g. a backlog gets cleared, a CGPA component was mis-entered).
// Past applications already submitted keep whatever data existed at the
// time they were made — this only changes what's used for FUTURE
// eligibility checks and future applications. ----
const OVERRIDABLE_FIELDS = [
  'college_email', 'college_name', 'whatsapp_number', 'gender',
  'aadhar_no', 'pan_no', 'dob', 'age', 'current_year',
  'tenth_board', 'tenth_percentage', 'tenth_passing_year',
  'twelfth_or_diploma_type', 'twelfth_or_diploma_name', 'twelfth_or_diploma_percentage', 'twelfth_passing_year',
  'college_passing_year', 'backlogs_active', 'backlogs_dead', 'year_gap',
  'sem1_sgpa', 'sem2_sgpa', 'sem3_sgpa', 'sem4_sgpa', 'sem5_sgpa', 'sem6_sgpa', 'sem7_sgpa',
  'appearing_for', 'degree', 'year_gap_reason', 'current_address', 'permanent_address',
  'parent_name', 'parent_contact_number', 'parent_email',
  'profile_locked',
];

router.patch('/students/:id/override', authRequired, requireRole('admin'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM students WHERE id = $1`, [req.params.id]);
  const current = rows[0];
  if (!current) return res.status(404).json({ error: 'Student not found' });

  const merged = { ...current };
  for (const field of OVERRIDABLE_FIELDS) {
    if (req.body[field] !== undefined) merged[field] = req.body[field];
  }

  const setClause = OVERRIDABLE_FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = OVERRIDABLE_FIELDS.map((f) => merged[f] ?? null);
  await db.query(`UPDATE students SET ${setClause} WHERE id = $${OVERRIDABLE_FIELDS.length + 1}`, [...values, req.params.id]);

  const changedFields = OVERRIDABLE_FIELDS.filter((f) => req.body[f] !== undefined);
  logAction(req.user, 'override_student', 'student', Number(req.params.id), { changedFields });

  res.json({ ok: true });
});

// ---- Coordinator only: mark a student verified after manually checking
// their submitted details. Superadmins can view the master database but
// cannot verify — that's a coordinator task. Requires the student to have
// already confirmed & locked their core profile — verifying an unlocked,
// possibly-still-changing profile wouldn't mean much. Verifying also
// freezes the ADDITIONAL_FIELDS group (parents, address, degree, etc.) in
// studentRoutes.js. ----
router.patch('/students/:id/verify', authRequired, requireCoordinator, async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM students WHERE id = $1`, [req.params.id]);
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!student.profile_locked) {
    return res.status(400).json({ error: "This student hasn't confirmed & locked their profile yet" });
  }

  await db.query(`UPDATE students SET verified = TRUE, verified_by = $1, verified_at = NOW() WHERE id = $2`, [req.user.id, req.params.id]);

  logAction(req.user, 'verify_student', 'student', Number(req.params.id), { studentName: student.name, prn: student.prn });

  res.json({ ok: true });
});

// ---- Superadmin only: view the audit log ----
router.get('/audit-log', authRequired, requireSuperadmin, async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500`);
  res.json(rows); // details is jsonb — pg already parses it into an object
});

module.exports = router;
