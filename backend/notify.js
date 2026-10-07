const db = require('./db/db');
const { sendMail } = require('./mailer');

async function createNotification(studentId, driveId, type, message) {
  await db.query(
    `INSERT INTO notifications (student_id, drive_id, type, message) VALUES ($1, $2, $3, $4)`,
    [studentId, driveId, type, message]
  );
}

// ---- New drive posted: notify EVERY registered student (not just those
// currently eligible) — eligibility only gates whether Apply is clickable,
// it shouldn't gate awareness. A student mid-way through their profile
// should still hear about a drive so they know to go finish it. ----
async function notifyAllStudentsOfNewDrive(drive) {
  const { rows: students } = await db.query(`SELECT * FROM students`);
  const message = `New drive posted: ${drive.company} — ${drive.role}. Check the Drives page for eligibility and to apply.`;

  for (const s of students) {
    await createNotification(s.id, drive.id, 'new_drive', message);
    const to = s.college_email || s.personal_email;
    if (to) await sendMail(to, `New placement drive: ${drive.company}`, message);
  }
}

// ---- Drive announcement (plain text, or a shortlist result): notify every
// student who applied to that drive. ----
async function notifyApplicantsOfAnnouncement(driveId, message) {
  const { rows: driveRows } = await db.query(`SELECT * FROM drives WHERE id = $1`, [driveId]);
  const drive = driveRows[0];
  const { rows: applicants } = await db.query(
    `SELECT s.* FROM applications a JOIN students s ON s.id = a.student_id WHERE a.drive_id = $1`,
    [driveId]
  );

  for (const s of applicants) {
    await createNotification(s.id, driveId, 'announcement', message);
    const to = s.college_email || s.personal_email;
    if (to && drive) await sendMail(to, `Announcement — ${drive.company} (${drive.role})`, message);
  }
}

module.exports = { createNotification, notifyAllStudentsOfNewDrive, notifyApplicantsOfAnnouncement };
