const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../db/db');
const { authRequired, requireRole } = require('../auth');
const { checkEligibility } = require('../ruleEngine');
const { computeCgpa, profileCompletion } = require('../profileHelpers');

const router = express.Router();

// An application-specific resume — a student can override their default
// profile resume just for one company, without touching the one on their
// Profile page. Stored as a blob, same as the profile resume. Same
// file-type restriction as the profile resume upload.
const applicationResumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.txt'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only PDF or TXT resumes are supported right now'), ok);
  },
});

async function isStudentPlaced(studentId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int as count FROM applications WHERE student_id = $1 AND status = 'Selected'`,
    [studentId]
  );
  return rows[0].count > 0;
}

// ---- Student: apply to a drive. Server re-checks everything - never trust
// the client tag. Accepts multipart form data: an optional 'resume' file
// (defaults to the student's profile resume if omitted), 'customResponses'
// (JSON string matching drive.custom_fields), and 'externalConfirmed'
// ('true'/'false', required if the drive has an external_link). ----
router.post('/:driveId/apply', authRequired, requireRole('student'), applicationResumeUpload.single('resume'), async (req, res) => {
  const { rows: driveRows } = await db.query(`SELECT * FROM drives WHERE id = $1`, [req.params.driveId]);
  const drive = driveRows[0];
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  const { rows: studentRows } = await db.query(`SELECT * FROM students WHERE id = $1`, [req.user.id]);
  const student = studentRows[0];

  if (!student.profile_locked) {
    const { missing } = profileCompletion(student);
    return res.status(400).json({ error: 'Confirm and lock your profile before applying', missing });
  }
  const hasResume = req.file || student.resume_data;
  if (!hasResume) {
    return res.status(400).json({ error: 'Upload a resume on your Profile page before applying' });
  }

  const placed = await isStudentPlaced(req.user.id);
  const studentWithCgpa = { ...student, cgpa: computeCgpa(student), isPlaced: placed };
  const { eligible, reasons } = checkEligibility(studentWithCgpa, drive);
  if (!eligible) {
    return res.status(403).json({ error: 'You are not eligible for this drive', reasons });
  }

  // External-application confirmation: required only if the drive has one.
  if (drive.external_link && req.body.externalConfirmed !== 'true') {
    return res.status(400).json({ error: 'Confirm that you have applied externally before submitting' });
  }

  // Drive-specific custom fields: every defined field must have a non-empty answer.
  const customFields = drive.custom_fields || []; // already parsed by pg (jsonb)
  let customResponses = {};
  if (req.body.customResponses) {
    try {
      customResponses = JSON.parse(req.body.customResponses);
    } catch {
      return res.status(400).json({ error: 'customResponses must be valid JSON' });
    }
  }
  const missingCustom = customFields.filter((f) => !customResponses[f.label]?.toString().trim());
  if (missingCustom.length > 0) {
    return res.status(400).json({ error: `Fill in required field(s): ${missingCustom.map((f) => f.label).join(', ')}` });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO applications (drive_id, student_id, resume_data, resume_filename, resume_mimetype, custom_responses, external_confirmed)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        req.params.driveId, req.user.id,
        req.file ? req.file.buffer : null,
        req.file ? req.file.originalname : null,
        req.file ? (path.extname(req.file.originalname).toLowerCase() === '.pdf' ? 'application/pdf' : 'text/plain') : null,
        customFields.length ? JSON.stringify(customResponses) : null,
        !!drive.external_link,
      ]
    );
    res.json({ id: rows[0].id, status: 'Applied' });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'You have already applied to this drive' });
    }
    res.status(500).json({ error: 'Application failed', detail: err.message });
  }
});

// ---- Student: withdraw an application. Allowed while status is Applied or
// Shortlisted — once Selected, withdrawing would corrupt placement records,
// so that's blocked (contact the placement office instead). Rejected
// applications can also be withdrawn, purely to tidy up one's own history. ----
router.delete('/:appId', authRequired, requireRole('student'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM applications WHERE id = $1 AND student_id = $2`, [req.params.appId, req.user.id]);
  const application = rows[0];
  if (!application) return res.status(404).json({ error: 'Application not found' });
  if (application.status === 'Selected') {
    return res.status(400).json({ error: 'You cannot withdraw an application after being selected. Contact the placement office.' });
  }
  await db.query(`DELETE FROM applications WHERE id = $1`, [req.params.appId]);
  res.json({ ok: true });
});

// ---- Student: application history ----
router.get('/me/history', authRequired, requireRole('student'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.id, a.status, a.applied_at, d.id as drive_id, d.company, d.role, d.package
     FROM applications a
     JOIN drives d ON d.id = a.drive_id
     WHERE a.student_id = $1
     ORDER BY a.applied_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

module.exports = router;
