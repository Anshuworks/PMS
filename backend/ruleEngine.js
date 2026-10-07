/**
 * Evaluates whether a student is eligible for a drive.
 * Returns { eligible: boolean, reasons: string[] }
 * reasons is empty if eligible; otherwise lists every failed criterion
 * (so the student sees the full picture, not just the first failure).
 */
function checkEligibility(student, drive) {
  const reasons = [];

  if ((student.cgpa ?? 0) < drive.min_cgpa) {
    reasons.push(`CGPA ${student.cgpa} is below required minimum ${drive.min_cgpa}`);
  }

  if ((student.tenth_percentage ?? 0) < (drive.min_tenth_percentage ?? 0)) {
    reasons.push(`10th percentage (${student.tenth_percentage}%) is below required minimum (${drive.min_tenth_percentage}%)`);
  }

  if ((student.twelfth_or_diploma_percentage ?? 0) < (drive.min_twelfth_percentage ?? 0)) {
    reasons.push(`12th/Diploma percentage (${student.twelfth_or_diploma_percentage}%) is below required minimum (${drive.min_twelfth_percentage}%)`);
  }

  if ((student.backlogs_active ?? 0) > drive.max_backlogs_active) {
    reasons.push(
      `Active backlogs (${student.backlogs_active}) exceed allowed limit (${drive.max_backlogs_active})`
    );
  }

  if ((student.backlogs_dead ?? 0) > drive.max_backlogs_dead) {
    reasons.push(
      `Dead backlogs (${student.backlogs_dead}) exceed allowed limit (${drive.max_backlogs_dead})`
    );
  }

  if ((student.year_gap ?? 0) > drive.max_year_gap) {
    reasons.push(
      `Year gap (${student.year_gap}) exceeds allowed limit (${drive.max_year_gap})`
    );
  }

  const allowedBranches = parseCsv(drive.allowed_branches);
  if (allowedBranches.length > 0 && !allowedBranches.includes((student.branch || '').toLowerCase())) {
    reasons.push(`Branch '${student.branch}' is not eligible for this drive`);
  }

  const allowedGenders = parseCsv(drive.allowed_genders);
  if (allowedGenders.length > 0 && !allowedGenders.includes((student.gender || '').toLowerCase())) {
    reasons.push(`This drive is restricted by gender criteria you do not meet`);
  }

  const allowedYears = parseCsv(drive.allowed_passing_years);
  if (allowedYears.length > 0 && !allowedYears.includes(String(student.college_passing_year))) {
    reasons.push(`This drive is restricted to passing years: ${allowedYears.join(', ')}`);
  }

  if (student.isPlaced && !drive.allow_placed_students) {
    reasons.push('You are already placed, and this drive does not accept already-placed students');
  }

  if (drive.deadline && new Date() > new Date(drive.deadline)) {
    reasons.push('The application deadline has passed');
  }

  if (drive.status !== 'open') {
    reasons.push('This drive is closed');
  }

  return { eligible: reasons.length === 0, reasons };
}

function parseCsv(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = { checkEligibility };
