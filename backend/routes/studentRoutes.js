const express = require('express');
const multer = require('multer');
const path = require('path');
const { createWorker } = require('tesseract.js');
const db = require('../db/db');
const { authRequired, requireRole } = require('../auth');
const {
  validateSemesterOrder,
  computeCgpa,
  profileCompletion,
} = require('../profileHelpers');

const router = express.Router();

// Resumes and marksheets are both handled entirely in memory now — resumes
// get written straight to the database as a blob (never touch local disk),
// and marksheets only ever exist in memory just long enough to run OCR.
const uploadResume = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.txt'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only PDF or TXT resumes are supported right now'), ok);
  },
});
const uploadMarksheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Upload a PNG or JPG photo/scan of the marksheet'), ok);
  },
});

async function extractResumeText(buffer, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.txt') return buffer.toString('utf-8');
  if (ext === '.pdf') {
    // pdf-parse v2 uses a PDFParse class, not the old v1 pdfParse(buffer) function.
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  return '';
}

// Best-effort regex guess for an SGPA-looking number (e.g. "SGPA: 8.42" or
// a lone "8.42" near the word SGPA/CGPA). This is a STARTING POINT ONLY —
// the student always confirms/corrects it before it's saved (see the
// /me/ocr/semester route below, which never writes to the DB itself).
function guessSgpa(ocrText) {
  const text = ocrText.replace(/\n/g, ' ');
  const labeled = text.match(/SGPA\D{0,10}(\d{1,2}\.\d{1,2})/i);
  if (labeled) return parseFloat(labeled[1]);
  const anyDecimal = text.match(/\b([0-9](?:\.\d{1,2})?)\b/g);
  if (anyDecimal) {
    const candidate = anyDecimal.map(Number).find((n) => n >= 4 && n <= 10);
    if (candidate) return candidate;
  }
  return null;
}

// ---- Student: view own profile (adds computed cgpa + completion status) ----
router.get('/me', authRequired, requireRole('student'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM students WHERE id = $1`, [req.user.id]);
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Not found' });
  const { password_hash, resume_data, ...safe } = student;
  const { complete, missing } = profileCompletion(student);
  res.json({ ...safe, cgpa: computeCgpa(student), profileComplete: complete, missingFields: missing });
});

// ---- Student: profile fields, in three groups.
// CORE_FIELDS: freely editable while profile_locked = false. Once the
// student confirms (POST /me/confirm below), these freeze forever — admin
// override is the only way to correct them afterward (see adminRoutes.js).
// ADDITIONAL_FIELDS: optional (not required to confirm/apply). Freely
// editable regardless of profile_locked, and freeze only once a coordinator
// manually verifies the student (see adminRoutes.js) — not tied to the
// student's own confirm action.
// OPTIONAL_SEM_FIELDS (semesters 5-7): NOT required to confirm, and stay
// individually fill-once regardless of either lock — so a student can
// confirm their profile in 3rd year using only sem 1-4, then come back and
// add sem 5, 6, 7 as each semester's results are announced. ----
const CORE_FIELDS = [
  'college_email', 'college_name', 'whatsapp_number', 'gender',
  'aadhar_no', 'pan_no', 'dob', 'age', 'current_year',
  'tenth_board', 'tenth_percentage', 'tenth_passing_year',
  'twelfth_or_diploma_type', 'twelfth_or_diploma_name', 'twelfth_or_diploma_percentage', 'twelfth_passing_year',
  'college_passing_year',
  'backlogs_active', 'backlogs_dead', 'year_gap',
  'sem1_sgpa', 'sem2_sgpa', 'sem3_sgpa', 'sem4_sgpa',
];
const ADDITIONAL_FIELDS = [
  'appearing_for', 'degree', 'year_gap_reason',
  'current_address', 'permanent_address',
  'parent_name', 'parent_contact_number', 'parent_email',
];
const OPTIONAL_SEM_FIELDS = ['sem5_sgpa', 'sem6_sgpa', 'sem7_sgpa'];
const ALL_PROFILE_FIELDS = [...CORE_FIELDS, ...ADDITIONAL_FIELDS, ...OPTIONAL_SEM_FIELDS];

router.put('/me', authRequired, requireRole('student'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM students WHERE id = $1`, [req.user.id]);
  const current = rows[0];

  // Auto-calculate age from DOB the first time a DOB is provided, so the
  // two fields can't disagree with each other.
  if (!current.profile_locked && current.dob == null && req.body.dob) {
    const dob = new Date(req.body.dob);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const hasHadBirthdayThisYear =
      today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
    if (!hasHadBirthdayThisYear) age -= 1;
    req.body.age = age;
  }

  const merged = { ...current };
  const rejectedFields = [];

  for (const field of CORE_FIELDS) {
    if (req.body[field] == null) continue;
    if (current.profile_locked) {
      rejectedFields.push(field);
      continue;
    }
    merged[field] = req.body[field];
  }

  for (const field of ADDITIONAL_FIELDS) {
    if (req.body[field] == null) continue;
    if (current.verified) {
      rejectedFields.push(field); // locked once a coordinator has verified
      continue;
    }
    merged[field] = req.body[field];
  }

  for (const field of OPTIONAL_SEM_FIELDS) {
    if (req.body[field] == null) continue;
    if (current[field] != null) {
      rejectedFields.push(field); // already filled once — locked individually
      continue;
    }
    merged[field] = req.body[field];
  }

  const semError = validateSemesterOrder(merged);
  if (semError) return res.status(400).json({ error: semError });

  const setClause = ALL_PROFILE_FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = ALL_PROFILE_FIELDS.map((f) => merged[f] ?? null);
  await db.query(`UPDATE students SET ${setClause} WHERE id = $${ALL_PROFILE_FIELDS.length + 1}`, [...values, req.user.id]);

  res.json({ ok: true, rejectedFields: rejectedFields.length ? rejectedFields : undefined });
});

// ---- Student: confirm & lock the profile. Only succeeds once every
// mandatory field is filled. After this, PUT /me above will reject all
// further edits to profile fields (resume stays editable). ----
router.post('/me/confirm', authRequired, requireRole('student'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM students WHERE id = $1`, [req.user.id]);
  const current = rows[0];

  if (current.profile_locked) {
    return res.json({ ok: true, alreadyLocked: true });
  }

  const { complete, missing } = profileCompletion(current);
  if (!complete) {
    return res.status(400).json({ error: 'Fill in every mandatory field before confirming', missing });
  }

  await db.query(`UPDATE students SET profile_locked = TRUE WHERE id = $1`, [req.user.id]);
  res.json({ ok: true });
});

// ---- Student: upload/replace resume (never locked). Stored directly as a
// blob in the database, not on local disk. ----
router.post('/me/resume', authRequired, requireRole('student'), uploadResume.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No resume file uploaded (field name must be "resume")' });
  try {
    const text = await extractResumeText(req.file.buffer, req.file.originalname);
    const mimetype = path.extname(req.file.originalname).toLowerCase() === '.pdf' ? 'application/pdf' : 'text/plain';
    await db.query(
      `UPDATE students SET resume_data = $1, resume_filename = $2, resume_mimetype = $3, resume_text = $4 WHERE id = $5`,
      [req.file.buffer, req.file.originalname, mimetype, text, req.user.id]
    );
    res.json({ ok: true, filename: req.file.originalname, extractedChars: text.length });
  } catch (err) {
    res.status(500).json({ error: 'Could not read resume text', detail: err.message });
  }
});

// ---- Student: OCR a semester marksheet image. Returns a *suggested* SGPA
// only — nothing is saved here, and the image itself is never written to
// disk or the database, just processed in memory. The student
// reviews/corrects the value and then saves it via PUT /me (sem<N>_sgpa),
// where the usual fill-once lock and "fill in order" rule apply. ----
router.post('/me/ocr/semester', authRequired, requireRole('student'), uploadMarksheet.single('marksheet'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No marksheet image uploaded (field name must be "marksheet")' });

  let worker;
  try {
    worker = await createWorker('eng');
    const { data } = await worker.recognize(req.file.buffer);
    const suggestedSgpa = guessSgpa(data.text);
    res.json({ rawText: data.text, suggestedSgpa });
  } catch (err) {
    res.status(500).json({ error: 'OCR failed — enter the SGPA manually', detail: err.message });
  } finally {
    if (worker) await worker.terminate();
  }
});

module.exports = router;
