import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatIST } from '../dateUtils';

const ACTION_LABELS = {
  verify_student: 'Verified student',
  override_student: 'Overrode student data',
  create_coordinator: 'Created coordinator',
  delete_coordinator: 'Deleted coordinator',
  create_drive: 'Created drive',
  close_drive: 'Closed drive',
  reopen_drive: 'Reopened drive',
  delete_drive: 'Deleted drive',
  update_deadline: 'Updated deadline',
  create_announcement: 'Posted announcement',
  update_applicant_status: 'Updated applicant status',
  bulk_update_applicant_status: 'Bulk-updated applicant status',
};

function describe(entry) {
  const d = entry.details || {};
  switch (entry.action) {
    case 'verify_student': return `${d.studentName} (${d.prn})`;
    case 'override_student': return `Fields: ${(d.changedFields || []).join(', ')}`;
    case 'create_coordinator': case 'delete_coordinator': return `${d.name} (${d.email})`;
    case 'create_drive': case 'delete_drive': return `${d.company} — ${d.role}`;
    case 'update_deadline': return d.deadline ? `New deadline: ${formatIST(d.deadline)} IST` : 'Deadline cleared';
    case 'create_announcement': return d.hasAttachment ? 'With attachment' : 'Text only';
    case 'update_applicant_status': return `→ ${d.status}`;
    case 'bulk_update_applicant_status': return `→ ${d.status} for ${d.updated?.length ?? 0} PRN(s)${d.notFound?.length ? `, ${d.notFound.length} not found` : ''}`;
    default: return '';
  }
}

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAuditLog().then(setEntries).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <div className="shell">
        <h1>Audit log</h1>
        <p className="muted">The last 500 admin actions, most recent first — for accountability across coordinators.</p>
        {error && <div className="error-banner">{error}</div>}

        <div className="card">
          {entries.length === 0 ? (
            <p className="muted">No actions logged yet.</p>
          ) : (
            <table>
              <thead>
                <tr><th>When (IST)</th><th>Who</th><th>Action</th><th>Details</th></tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{formatIST(e.created_at)}</td>
                    <td>{e.actor_name || 'Unknown'}</td>
                    <td>{ACTION_LABELS[e.action] || e.action}</td>
                    <td className="muted">{describe(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
