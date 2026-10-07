const express = require('express');
const db = require('../db/db');

const router = express.Router();

// These are intentionally UNAUTHENTICATED — they replace what used to be
// plain static file links (e.g. in the per-drive CSV export sent to a
// company, or a public shortlist attachment link). A company reviewing
// resumes doesn't have — and shouldn't need — a login to this system.
// Anyone with the exact URL (which itself isn't guessable — it's a
// database row ID) can view/download the file, same as before when it was
// a public /uploads/<filename> link.

function sendBlob(res, row, dataCol, filenameCol, mimeCol) {
  if (!row || !row[dataCol]) return res.status(404).json({ error: 'File not found' });
  res.setHeader('Content-Type', row[mimeCol] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${row[filenameCol] || 'download'}"`);
  res.send(row[dataCol]);
}

// ---- A student's current default profile resume ----
router.get('/resume/student/:studentId', async (req, res) => {
  const { rows } = await db.query(
    `SELECT resume_data, resume_filename, resume_mimetype FROM students WHERE id = $1`,
    [req.params.studentId]
  );
  sendBlob(res, rows[0], 'resume_data', 'resume_filename', 'resume_mimetype');
});

// ---- The resume attached to one specific application — falls back to the
// student's profile default if this application didn't override it. ----
router.get('/resume/application/:applicationId', async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.resume_data, a.resume_filename, a.resume_mimetype,
            s.resume_data as student_resume_data, s.resume_filename as student_resume_filename, s.resume_mimetype as student_resume_mimetype
     FROM applications a JOIN students s ON s.id = a.student_id
     WHERE a.id = $1`,
    [req.params.applicationId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Application not found' });
  if (row.resume_data) {
    return sendBlob(res, row, 'resume_data', 'resume_filename', 'resume_mimetype');
  }
  sendBlob(res, {
    resume_data: row.student_resume_data,
    resume_filename: row.student_resume_filename,
    resume_mimetype: row.student_resume_mimetype,
  }, 'resume_data', 'resume_filename', 'resume_mimetype');
});

// ---- An announcement's attached file (shortlist sheet, image, PDF, etc.) ----
router.get('/announcement/:announcementId', async (req, res) => {
  const { rows } = await db.query(
    `SELECT attachment_data, attachment_filename, attachment_mimetype FROM announcements WHERE id = $1`,
    [req.params.announcementId]
  );
  sendBlob(res, rows[0], 'attachment_data', 'attachment_filename', 'attachment_mimetype');
});

module.exports = router;
