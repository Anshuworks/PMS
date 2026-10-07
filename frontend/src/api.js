const BASE = 'http://localhost:4000/api';

function authHeaders() {
  const token = localStorage.getItem('pms_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const isCsv = res.headers.get('content-type')?.includes('text/csv');
  if (isCsv) return res.text();

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.reasons = data.reasons;
    err.missing = data.missing;
    throw err;
  }
  return data;
}

async function uploadFile(path, fieldName, file, extraFields = {}) {
  const token = localStorage.getItem('pms_token');
  const formData = new FormData();
  formData.append(fieldName, file);
  for (const [k, v] of Object.entries(extraFields)) formData.append(k, v);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// Like uploadFile, but the file is optional — used for forms (like
// announcements) that are valid with just text fields and an attachment
// only sometimes. Appending an empty file part when none is chosen would
// confuse multer on the backend into thinking a (broken) file was sent.
async function postMultipart(path, fields = {}, file, fileField = 'file') {
  const token = localStorage.getItem('pms_token');
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.append(k, v);
  if (file) formData.append(fileField, file);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Like postMultipart, but for PATCH endpoints (bulk-status-from-sheet).
async function patchMultipart(path, fields = {}, file, fileField = 'file') {
  const token = localStorage.getItem('pms_token');
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.append(k, v);
  if (file) formData.append(fileField, file);
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  registerStudent: (body) => request('/auth/register/student', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request('/auth/me'),
  forgotPassword: (identifier, role) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ identifier, role }) }),
  resetPassword: (identifier, role, otp, newPassword) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ identifier, role, otp, newPassword }) }),

  getDrives: () => request('/drives'),
  createDrive: (body) => request('/drives', { method: 'POST', body: JSON.stringify(body) }),
  getApplicants: (driveId) => request(`/drives/${driveId}/applicants`),
  updateApplicantStatus: (driveId, appId, status) =>
    request(`/drives/${driveId}/applicants/${appId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  bulkUpdateApplicantStatus: (driveId, prns, status) =>
    request(`/drives/${driveId}/applicants/bulk-status`, { method: 'PATCH', body: JSON.stringify({ prns, status }) }),
  bulkUpdateApplicantStatusFromSheet: (driveId, file, status) => {
    const fields = status ? { status } : {};
    return patchMultipart(`/drives/${driveId}/applicants/bulk-status/upload`, fields, file, 'sheet');
  },
  closeDrive: (driveId) => request(`/drives/${driveId}/close`, { method: 'PATCH' }),
  reopenDrive: (driveId) => request(`/drives/${driveId}/reopen`, { method: 'PATCH' }),
  updateDriveDeadline: (driveId, deadline) => request(`/drives/${driveId}/deadline`, { method: 'PATCH', body: JSON.stringify({ deadline }) }),
  deleteDrive: (driveId) => request(`/drives/${driveId}`, { method: 'DELETE' }),
  exportDrive: (driveId) => request(`/drives/${driveId}/export`),

  applyToDrive: (driveId, { resumeFile, customResponses, externalConfirmed } = {}) => {
    const fields = {};
    if (customResponses) fields.customResponses = JSON.stringify(customResponses);
    if (externalConfirmed !== undefined) fields.externalConfirmed = String(externalConfirmed);
    return postMultipart(`/applications/${driveId}/apply`, fields, resumeFile, 'resume');
  },
  withdrawApplication: (appId) => request(`/applications/${appId}`, { method: 'DELETE' }),
  getHistory: () => request('/applications/me/history'),

  getMyProfile: () => request('/students/me'),
  updateMyProfile: (body) => request('/students/me', { method: 'PUT', body: JSON.stringify(body) }),
  confirmProfile: () => request('/students/me/confirm', { method: 'POST' }),
  uploadResume: (file) => uploadFile('/students/me/resume', 'resume', file),
  ocrSemesterMarksheet: (file) => uploadFile('/students/me/ocr/semester', 'marksheet', file),

  getMasterDatabase: () => request('/admin/students'),
  exportMasterSheet: () => request('/admin/students/export'),
  verifyStudent: (id) => request(`/admin/students/${id}/verify`, { method: 'PATCH' }),
  overrideStudent: (id, body) => request(`/admin/students/${id}/override`, { method: 'PATCH', body: JSON.stringify(body) }),
  getAuditLog: () => request('/admin/audit-log'),

  createCoordinator: (body) => request('/superadmin/coordinators', { method: 'POST', body: JSON.stringify(body) }),
  getCoordinators: () => request('/superadmin/coordinators'),
  deleteCoordinator: (id) => request(`/superadmin/coordinators/${id}`, { method: 'DELETE' }),

  getAnnouncements: (driveId) => request(`/drives/${driveId}/announcements`),
  createAnnouncement: (driveId, message, file) =>
    postMultipart(`/drives/${driveId}/announcements`, { message }, file, 'attachment'),

  getMyNotifications: () => request('/notifications/me'),
  getUnreadNotificationCount: () => request('/notifications/me/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),

  getHelpContacts: () => request('/settings/help-contacts'),
  updateHelpContacts: (contacts) => request('/settings/help-contacts', { method: 'PUT', body: JSON.stringify({ contacts }) }),
};
