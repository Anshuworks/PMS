/**
 * Rules for the semester-wise SGPA -> CGPA logic and overall profile
 * completeness gating (a student can only apply to drives once their
 * mandatory profile fields are filled).
 */

// Semester fields in order. Sem 1-4 are mandatory for everyone (placements
// start from 3rd year, but by then sem 1-4 results already exist). Sem 5-7
// are optional and must be filled strictly in order.
const SEM_FIELDS = ['sem1_sgpa', 'sem2_sgpa', 'sem3_sgpa', 'sem4_sgpa', 'sem5_sgpa', 'sem6_sgpa', 'sem7_sgpa'];
const MANDATORY_SEM_COUNT = 4;

/**
 * Validates that semester SGPA values obey the "fill in order" rule:
 * you cannot have sem6 filled while sem5 is empty, etc. This is checked on
 * every profile save. The separate "sem 1-4 are mandatory" requirement is
 * NOT checked here — it's checked once, in profileCompletion() below, as
 * part of "can this student apply to drives yet?". Enforcing it here too
 * would make it impossible to save semester 1 by itself, since sem2-4
 * would still be empty at that point — a Catch-22 that blocked incremental
 * saving entirely.
 * @returns {string|null} an error message, or null if valid
 */
function validateSemesterOrder(student) {
  let seenGap = false;
  for (let i = 0; i < SEM_FIELDS.length; i++) {
    const filled = student[SEM_FIELDS[i]] != null;
    if (!filled) {
      seenGap = true;
    } else if (seenGap) {
      return `Semester ${i + 1} SGPA is filled but an earlier semester is empty. Fill semesters in order.`;
    }
  }
  return null;
}

/**
 * Computes overall CGPA as the average of whichever semesters are filled
 * (simple average — swap for credit-weighted average later if your college
 * uses credit-weighted CGPA rather than a flat semester average).
 */
function computeCgpa(student) {
  const filled = SEM_FIELDS.map((f) => student[f]).filter((v) => v != null);
  if (filled.length === 0) return null;
  const sum = filled.reduce((a, b) => a + b, 0);
  return Math.round((sum / filled.length) * 100) / 100;
}

// Fields that must be non-null before a student can apply to any drive.
// Resume is intentionally checked separately (applications.js) since its
// absence should give a clearer, resume-specific message.
const MANDATORY_PROFILE_FIELDS = [
  'college_email', 'college_name', 'whatsapp_number', 'gender',
  'aadhar_no', 'pan_no', 'dob', 'age', 'current_year',
  'tenth_board', 'tenth_percentage', 'tenth_passing_year',
  'twelfth_or_diploma_type', 'twelfth_or_diploma_name', 'twelfth_or_diploma_percentage', 'twelfth_passing_year',
  'college_passing_year',
  'backlogs_active', 'backlogs_dead', 'year_gap',
  'sem1_sgpa', 'sem2_sgpa', 'sem3_sgpa', 'sem4_sgpa',
];

function profileCompletion(student) {
  const missing = MANDATORY_PROFILE_FIELDS.filter((f) => student[f] == null || student[f] === '');
  return { complete: missing.length === 0, missing };
}

module.exports = {
  SEM_FIELDS,
  MANDATORY_SEM_COUNT,
  MANDATORY_PROFILE_FIELDS,
  validateSemesterOrder,
  computeCgpa,
  profileCompletion,
};
