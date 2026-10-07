// All dates/times in this app are shown in Indian Standard Time regardless
// of the viewer's browser locale/timezone, since this is a single-college
// system where every deadline and announcement is understood in IST.

export function formatIST(dateStr, opts = {}) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: opts.dateStyle ?? 'medium',
    timeStyle: opts.timeStyle ?? 'short',
  });
}

export function formatISTDateOnly(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
  });
}

// Converts a <input type="datetime-local"> value (e.g. "2026-09-20T10:00",
// no timezone info) into a UTC ISO string, treating the entered value as
// IST wall-clock time. This is what lets admins type a deadline "as they'd
// say it out loud" (IST) while the backend stores/compares everything in
// UTC consistently.
export function istLocalInputToUtcIso(localValue) {
  if (!localValue) return null;
  return new Date(`${localValue}:00+05:30`).toISOString();
}

// Converts a UTC ISO string back into the "YYYY-MM-DDTHH:mm" shape a
// datetime-local input expects, rendered in IST — used to prefill the
// "edit deadline" form with the drive's current deadline.
export function utcIsoToISTLocalInput(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  // en-CA gives YYYY-MM-DD; combine with HH:mm extracted the same way.
  const datePart = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const timePart = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  return `${datePart}T${timePart}`;
}
