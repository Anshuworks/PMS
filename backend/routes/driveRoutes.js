const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../db/db');
const { authRequired, requireRole } = require('../auth');
const { checkEligibility } = require('../ruleEngine');
const { computeCgpa } = require('../profileHelpers');
const { Parser } = require('json2csv');
const { notifyAllStudentsOfNewDrive, notifyApplicantsOfAnnouncement } = require('../notify');
const { logAction } = require('../auditLog');

const router = express.Router();

// Announcement attachments (shortlist sheets, images, PDFs, etc.) and
// shortlist status sheets are both handled entirely in memory — attachments
// get written straight into the database as a blob, and status sheets only
// ever need their parsed rows, never the file itself.
const announcementUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const sheetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function guessMimetype(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain' };
  return map[ext] || 'application/octet-stream';
}

// Whether a student counts as "already placed" — has at least one
// application with status 'Selected'. Used both for the eligibility rule
// (drive.allow_placed_students) and exposed on the student's own drive list.
async function isStudentPlaced(studentId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int as count FROM applications WHERE student_id = $1 AND status = 'Selected'`,
    [studentId]
  );
  return rows[0].count > 0;
}

// A drive's real-world status for display: 'closed' (admin closed it
// manually), 'expired' (deadline passed but nobody closed it), or 'open'.
// This is derived, not stored — "expired" un-derives itself automatically
// if an admin extends the deadline, no separate "reopen" bookkeeping needed
// for that case.
function computedStatus(drive) {
  if (drive.status === 'closed') return 'closed';
  if (drive.deadline && new Date() > new Date(drive.deadline)) return 'expired';
  return 'open';
}

// ---- Admin: create a drive with eligibility rules ----
router.post('/', authRequired, requireRole('admin'), async (req, res) => {
  const {
    company, role, package: pkg, description,
    min_cgpa, min_tenth_percentage, min_twelfth_percentage,
    max_backlogs_active, max_backlogs_dead, max_year_gap,
    allowed_branches, allowed_genders, allowed_passing_years, deadline,
    allow_placed_students, extra_notes, external_link, custom_fields,
  } = req.body;

  if (!company || !role) {
    return res.status(400).json({ error: 'company and role are required' });
  }

  // custom_fields: [{ label, type: 'text'|'select', options?: string[] }]
  const cleanCustomFields = Array.isArray(custom_fields)
    ? custom_fields.filter((f) => f.label && f.label.trim()).map((f) => ({
        label: f.label.trim(),
        type: f.type === 'select' ? 'select' : 'text',
        options: f.type === 'select' ? (f.options || []).filter(Boolean) : undefined,
      }))
    : [];

  const { rows } = await db.query(
    `INSERT INTO drives (
       company, role, package, description,
       min_cgpa, min_tenth_percentage, min_twelfth_percentage,
       max_backlogs_active, max_backlogs_dead, max_year_gap,
       allowed_branches, allowed_genders, allowed_passing_years, deadline,
       allow_placed_students, extra_notes, external_link, custom_fields, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [
      company, role, pkg || null, description || null,
      min_cgpa ?? 0, min_tenth_percentage ?? 0, min_twelfth_percentage ?? 0,
      max_backlogs_active ?? 999, max_backlogs_dead ?? 999, max_year_gap ?? 999,
      (allowed_branches || []).join(','), (allowed_genders || []).join(','),
      (allowed_passing_years || []).join(','), deadline || null,
      !!allow_placed_students, extra_notes || null, external_link || null,
      cleanCustomFields.length ? JSON.stringify(cleanCustomFields) : null,
      req.user.id,
    ]
  );
  const id = rows[0].id;

  const { rows: driveRows } = await db.query(`SELECT * FROM drives WHERE id = $1`, [id]);
  // Fire and forget — a slow/failed notification batch should never block
  // or fail the drive-creation response.
  notifyAllStudentsOfNewDrive(driveRows[0]).catch((err) => console.error('Notify new drive failed:', err));

  logAction(req.user, 'create_drive', 'drive', id, { company, role });

  res.json({ id });
});

// ---- List all drives. Students get eligibility tag, reasons, and hasApplied flag ----
router.get('/', authRequired, async (req, res) => {
  const { rows: drives } = await db.query(`SELECT * FROM drives ORDER BY created_at DESC`);
  const withComputedStatus = drives.map((d) => ({
    ...d,
    computedStatus: computedStatus(d),
    custom_fields: d.custom_fields || [], // already parsed by pg (jsonb)
  }));

  if (req.user.role !== 'student') {
    return res.json(withComputedStatus);
  }

  const { rows: studentRows } = await db.query(`SELECT * FROM students WHERE id = $1`, [req.user.id]);
  const student = studentRows[0];
  const placed = await isStudentPlaced(req.user.id);
  const studentWithCgpa = { ...student, cgpa: computeCgpa(student), isPlaced: placed };
  const profileConfirmed = !!student.profile_locked;

  const { rows: appliedRows } = await db.query(`SELECT drive_id FROM applications WHERE student_id = $1`, [req.user.id]);
  const appliedDriveIds = new Set(appliedRows.map((r) => r.drive_id));

  const withEligibility = withComputedStatus.map((drive) => {
    const { eligible, reasons } = checkEligibility(studentWithCgpa, drive);
    return {
      ...drive,
      eligible: eligible && profileConfirmed,
      reasons: profileConfirmed ? reasons : [...reasons, 'Confirm and lock your profile before applying'],
      hasApplied: appliedDriveIds.has(drive.id),
    };
  });
  res.json(withEligibility);
});

// ---- Admin: edit a drive's deadline (also doubles as "reopen" for a
// drive that auto-expired — set a new future deadline, or clear it
// entirely by sending deadline: null to remove the constraint). ----
router.patch('/:id/deadline', authRequired, requireRole('admin'), async (req, res) => {
  const { deadline } = req.body;
  await db.query(`UPDATE drives SET deadline = $1 WHERE id = $2`, [deadline || null, req.params.id]);
  logAction(req.user, 'update_deadline', 'drive', Number(req.params.id), { deadline });
  res.json({ ok: true });
});

// ---- Admin: reopen a manually-closed drive ----
router.patch('/:id/reopen', authRequired, requireRole('admin'), async (req, res) => {
  await db.query(`UPDATE drives SET status = 'open' WHERE id = $1`, [req.params.id]);
  logAction(req.user, 'reopen_drive', 'drive', Number(req.params.id));
  res.json({ ok: true });
});

// ---- Admin: close a drive manually ----
router.patch('/:id/close', authRequired, requireRole('admin'), async (req, res) => {
  await db.query(`UPDATE drives SET status = 'closed' WHERE id = $1`, [req.params.id]);
  logAction(req.user, 'close_drive', 'drive', Number(req.params.id));
  res.json({ ok: true });
});

// ---- Admin: permanently delete an old drive (e.g. clearing out a past
// batch's drives before a new academic year). Applications/announcements/
// notifications cascade automatically via ON DELETE CASCADE. ----
router.delete('/:id', authRequired, requireRole('admin'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM drives WHERE id = $1`, [req.params.id]);
  const drive = rows[0];
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  await db.query(`DELETE FROM drives WHERE id = $1`, [req.params.id]);
  logAction(req.user, 'delete_drive', 'drive', Number(req.params.id), { company: drive.company, role: drive.role });
  res.json({ ok: true });
});

// ---- Admin: post an announcement on a drive, with an optional attachment
// (shortlist sheet, image, PDF, etc.) stored as a blob. Notifies (in-app +
// email) every student who has already applied to it. ----
router.post('/:id/announcements', authRequired, requireRole('admin'), announcementUpload.single('attachment'), async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const { rows: driveRows } = await db.query(`SELECT * FROM drives WHERE id = $1`, [req.params.id]);
  if (!driveRows[0]) return res.status(404).json({ error: 'Drive not found' });

  const hasAttachment = !!req.file;
  const { rows } = await db.query(
    `INSERT INTO announcements (drive_id, message, attachment_data, attachment_filename, attachment_mimetype, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      req.params.id, message.trim(),
      hasAttachment ? req.file.buffer : null,
      hasAttachment ? req.file.originalname : null,
      hasAttachment ? guessMimetype(req.file.originalname) : null,
      req.user.id,
    ]
  );

  notifyApplicantsOfAnnouncement(req.params.id, message.trim())
    .catch((err) => console.error('Notify announcement failed:', err));

  logAction(req.user, 'create_announcement', 'drive', Number(req.params.id), { hasAttachment });

  res.json({ id: rows[0].id, hasAttachment });
});

// ---- View announcements for a drive. Open to any logged-in user (student
// or admin) — a student can see what's been posted about a drive whether
// or not they've applied yet. ----
router.get('/:id/announcements', authRequired, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, message, attachment_filename, created_at FROM announcements WHERE drive_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
  );
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const withUrls = rows.map((a) => ({
    ...a,
    attachmentUrl: a.attachment_filename ? `${baseUrl}/api/files/announcement/${a.id}` : null,
  }));
  res.json(withUrls);
});

// ---- Admin: view applicants for a specific drive ----
router.get('/:id/applicants', authRequired, requireRole('admin'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.id as application_id, a.status, a.applied_at,
            (a.resume_data IS NOT NULL) as has_override_resume,
            s.id as student_id, s.name, s.prn, s.branch, s.gender, s.verified,
            s.sem1_sgpa, s.sem2_sgpa, s.sem3_sgpa, s.sem4_sgpa, s.sem5_sgpa, s.sem6_sgpa, s.sem7_sgpa
     FROM applications a
     JOIN students s ON s.id = a.student_id
     WHERE a.drive_id = $1
     ORDER BY a.applied_at DESC`,
    [req.params.id]
  );
  const withCgpa = rows.map((a) => ({ ...a, cgpa: computeCgpa(a) }));
  res.json(withCgpa);
});

// Shared core for both the manual-paste and sheet-upload bulk update paths.
async function applyBulkStatusUpdate(driveId, prns, statusOrMap) {
  const cleanPrns = [...new Set(prns.map((p) => String(p).trim()).filter(Boolean))];
  const updated = [];
  const notFound = [];

  for (const prn of cleanPrns) {
    const { rows } = await db.query(
      `SELECT a.id FROM applications a JOIN students s ON s.id = a.student_id WHERE a.drive_id = $1 AND s.prn = $2`,
      [driveId, prn]
    );
    const app = rows[0];
    if (app) {
      const status = typeof statusOrMap === 'string' ? statusOrMap : statusOrMap[prn];
      await db.query(`UPDATE applications SET status = $1 WHERE id = $2`, [status, app.id]);
      updated.push(prn);
    } else {
      notFound.push(prn);
    }
  }
  return { updated, notFound };
}

// ---- Admin: bulk-update applicant status by PRN — paste a list of PRNs
// (comma or newline separated) instead of clicking through them one at a
// time. Only PRNs that have an actual application to this drive are
// updated; anything else is reported back as "not found" so nothing is
// silently ignored. Defined BEFORE /:appId below — otherwise Express would
// match "bulk-status" as if it were an :appId value. ----
router.patch('/:id/applicants/bulk-status', authRequired, requireRole('admin'), async (req, res) => {
  const { prns, status } = req.body;
  const allowed = ['Applied', 'Shortlisted', 'Selected', 'Rejected'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  }
  if (!Array.isArray(prns) || prns.length === 0) {
    return res.status(400).json({ error: 'prns must be a non-empty array' });
  }

  const { updated, notFound } = await applyBulkStatusUpdate(req.params.id, prns, status);
  logAction(req.user, 'bulk_update_applicant_status', 'drive', Number(req.params.id), { status, updated, notFound });
  res.json({ updatedCount: updated.length, updated, notFound });
});

// ---- Admin: bulk-update applicant status from an uploaded sheet (xlsx or
// csv) — the format a company sends back with their shortlisted/selected/
// rejected candidates. Looks for a column headed "PRN" (case-insensitive).
// If the sheet also has a "Status" column, each row's own status is used
// (handy when a company sends one mixed sheet); otherwise every PRN found
// gets the single status chosen in the upload form. ----
router.patch('/:id/applicants/bulk-status/upload', authRequired, requireRole('admin'), sheetUpload.single('sheet'), async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['Applied', 'Shortlisted', 'Selected', 'Rejected'];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowedStatuses.join(', ')}` });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No sheet uploaded (field name must be "sheet")' });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const filename = req.file.originalname.toLowerCase();
    if (filename.endsWith('.csv')) {
      await workbook.csv.read(require('stream').Readable.from(req.file.buffer));
    } else {
      await workbook.xlsx.load(req.file.buffer);
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'Could not read any sheet from that file' });

    // Find the header row (row 1) and locate the PRN / Status columns by name.
    const headerRow = sheet.getRow(1);
    let prnCol = null;
    let statusCol = null;
    headerRow.eachCell((cell, colNumber) => {
      const header = String(cell.value || '').trim().toLowerCase();
      if (header === 'prn') prnCol = colNumber;
      if (header === 'status') statusCol = colNumber;
    });

    if (!prnCol) {
      return res.status(400).json({ error: 'Could not find a "PRN" column in the uploaded sheet' });
    }
    if (!statusCol && !status) {
      return res.status(400).json({ error: 'Sheet has no "Status" column — choose a status to apply to every row' });
    }

    const prns = [];
    const perPrnStatus = {};
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const prn = String(row.getCell(prnCol).value || '').trim();
      if (!prn) return;
      prns.push(prn);
      if (statusCol) {
        const rowStatus = String(row.getCell(statusCol).value || '').trim();
        if (allowedStatuses.includes(rowStatus)) perPrnStatus[prn] = rowStatus;
      }
    });

    if (prns.length === 0) {
      return res.status(400).json({ error: 'No PRN values found in the sheet' });
    }

    // Any PRN without a valid per-row status falls back to the chosen default.
    const statusMap = statusCol
      ? Object.fromEntries(prns.map((p) => [p, perPrnStatus[p] || status]))
      : status;
    if (statusCol && prns.some((p) => !statusMap[p])) {
      return res.status(400).json({ error: 'Some rows have no valid status and no default status was chosen' });
    }

    const { updated, notFound } = await applyBulkStatusUpdate(req.params.id, prns, statusMap);
    logAction(req.user, 'bulk_update_applicant_status_from_sheet', 'drive', Number(req.params.id), {
      filename: req.file.originalname, updated, notFound,
    });
    res.json({ updatedCount: updated.length, updated, notFound });
  } catch (err) {
    res.status(500).json({ error: 'Could not parse that sheet', detail: err.message });
  }
});

// ---- Admin: update an applicant's status (Shortlisted / Selected / Rejected) ----
router.patch('/:id/applicants/:appId', authRequired, requireRole('admin'), async (req, res) => {
  const { status } = req.body;
  const allowed = ['Applied', 'Shortlisted', 'Selected', 'Rejected'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  }
  await db.query(`UPDATE applications SET status = $1 WHERE id = $2 AND drive_id = $3`, [status, req.params.appId, req.params.id]);
  logAction(req.user, 'update_applicant_status', 'application', Number(req.params.appId), { driveId: Number(req.params.id), status });
  res.json({ ok: true });
});

// ---- Admin: export applicants for a drive as CSV, in the exact shape a
// company expects (not the same as the internal master sheet). ----
router.get('/:id/export', authRequired, requireRole('admin'), async (req, res) => {
  const { rows: applicants } = await db.query(
    `SELECT s.*, a.id as application_id, a.status as application_status, a.applied_at,
            (a.resume_data IS NOT NULL) as has_override_resume
     FROM applications a
     JOIN students s ON s.id = a.student_id
     WHERE a.drive_id = $1`,
    [req.params.id]
  );

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const rows = applicants.map((s) => {
    const cgpa = computeCgpa(s);
    return {
      prn: s.prn,
      name: s.name,
      gender: s.gender,
      dob: s.dob,
      branch: s.branch,
      personal_email: s.personal_email,
      college_email: s.college_email,
      contact_number: s.phone,
      whatsapp_number: s.whatsapp_number,
      tenth_percentage: s.tenth_percentage,
      tenth_passing_year: s.tenth_passing_year,
      twelfth_or_diploma_type: s.twelfth_or_diploma_type,
      twelfth_or_diploma_percentage: s.twelfth_or_diploma_percentage,
      twelfth_or_diploma_passing_year: s.twelfth_passing_year,
      gap_in_education: s.year_gap && s.year_gap > 0 ? 'Yes' : 'No',
      number_of_gap_years: s.year_gap ?? 0,
      aggregate_cgpa: cgpa,
      active_backlog: s.backlogs_active && s.backlogs_active > 0 ? s.backlogs_active : 'No',
      dead_backlog: s.backlogs_dead && s.backlogs_dead > 0 ? s.backlogs_dead : 'No',
      year_of_passing: s.college_passing_year,
      undergraduate_degree: s.degree,
      college_name: s.college_name,
      resume_link: `${baseUrl}/api/files/resume/application/${s.application_id}`,
    };
  });

  const parser = new Parser();
  const csv = parser.parse(rows.length ? rows : [{ note: 'No applicants yet' }]);
  res.header('Content-Type', 'text/csv');
  res.attachment(`drive-${req.params.id}-applicants.csv`);
  res.send(csv);
});

module.exports = router;
