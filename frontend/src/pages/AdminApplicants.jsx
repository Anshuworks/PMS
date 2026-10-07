import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { formatIST } from '../dateUtils';

const STATUSES = ['Applied', 'Shortlisted', 'Selected', 'Rejected'];

export default function AdminApplicants() {
  const { id } = useParams();
  const [applicants, setApplicants] = useState([]);
  const [error, setError] = useState('');
  const [company, setCompany] = useState('');
  const [bulkPrns, setBulkPrns] = useState('');
  const [bulkStatus, setBulkStatus] = useState('Shortlisted');
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sheetFile, setSheetFile] = useState(null);
  const [sheetStatus, setSheetStatus] = useState('Shortlisted');
  const [sheetResult, setSheetResult] = useState(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    try {
      const [apps, drives] = await Promise.all([api.getApplicants(id), api.getDrives()]);
      setApplicants(apps);
      setCompany(drives.find((d) => String(d.id) === id)?.company || '');
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateStatus(appId, status) {
    await api.updateApplicantStatus(id, appId, status);
    load();
  }

  async function submitBulk(e) {
    e.preventDefault();
    const prns = bulkPrns.split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
    if (prns.length === 0) return;
    setBulkBusy(true);
    setError('');
    setBulkResult(null);
    try {
      const result = await api.bulkUpdateApplicantStatus(id, prns, bulkStatus);
      setBulkResult(result);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function submitSheet(e) {
    e.preventDefault();
    if (!sheetFile) return;
    setSheetBusy(true);
    setError('');
    setSheetResult(null);
    try {
      const result = await api.bulkUpdateApplicantStatusFromSheet(id, sheetFile, sheetStatus);
      setSheetResult(result);
      setSheetFile(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSheetBusy(false);
    }
  }

  async function downloadCsv() {
    try {
      const csv = await api.exportDrive(id);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(company || 'drive').replace(/\s+/g, '-')}-applicants.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="shell">
        <Link to="/admin" className="muted">&larr; Back to drives</Link>
        <div className="drive-head" style={{ marginTop: 10 }}>
          <h1>Applicants{company ? ` — ${company}` : ''}</h1>
          <button className="btn btn-ghost" onClick={downloadCsv}>Export CSV</button>
        </div>
        {error && <div className="error-banner">{error}</div>}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bulk update by PRN</h3>
          <p className="muted" style={{ marginTop: -6 }}>
            Paste a list of PRNs (comma or newline separated) to update all of them at once — useful for shortlist sheets from a company.
          </p>
          <form onSubmit={submitBulk}>
            <div className="row">
              <div className="field" style={{ flex: 2 }}>
                <label>PRNs</label>
                <textarea rows="3" value={bulkPrns} onChange={(e) => setBulkPrns(e.target.value)} placeholder={'PRN001, PRN002\nPRN003'} />
              </div>
              <div className="field" style={{ maxWidth: 200 }}>
                <label>New status</label>
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <button className="btn" type="submit" disabled={bulkBusy || !bulkPrns.trim()}>
              {bulkBusy ? 'Updating…' : 'Apply to all'}
            </button>
          </form>
          {bulkResult && (
            <p className="muted" style={{ marginTop: 10 }}>
              Updated {bulkResult.updatedCount} applicant(s).
              {bulkResult.notFound?.length > 0 && ` Not found (no application to this drive): ${bulkResult.notFound.join(', ')}`}
            </p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Upload a shortlist sheet</h3>
          <p className="muted" style={{ marginTop: -6 }}>
            Upload the .xlsx or .csv file a company sends back directly — it needs a "PRN" column.
            If the sheet also has a "Status" column, each row's own status is used; otherwise pick one below.
          </p>
          <form onSubmit={submitSheet}>
            <div className="row" style={{ alignItems: 'end' }}>
              <div className="field">
                <label>Sheet file (.xlsx or .csv)</label>
                <input type="file" accept=".xlsx,.csv" onChange={(e) => setSheetFile(e.target.files[0] || null)} />
              </div>
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Default status (if sheet has no Status column)</label>
                <select value={sheetStatus} onChange={(e) => setSheetStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <button className="btn" type="submit" disabled={sheetBusy || !sheetFile}>
              {sheetBusy ? 'Processing…' : 'Upload & apply'}
            </button>
          </form>
          {sheetResult && (
            <p className="muted" style={{ marginTop: 10 }}>
              Updated {sheetResult.updatedCount} applicant(s).
              {sheetResult.notFound?.length > 0 && ` Not found (no application to this drive): ${sheetResult.notFound.join(', ')}`}
            </p>
          )}
        </div>

        <div className="card">
          {applicants.length === 0 ? (
            <p className="muted">No applications yet.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>PRN</th><th>Branch</th><th>CGPA</th><th>Gender</th><th>Verified</th><th>Resume</th><th>Applied (IST)</th><th>Status</th></tr>
              </thead>
              <tbody>
                {applicants.map((a) => (
                  <tr key={a.application_id}>
                    <td>{a.name}</td>
                    <td>{a.prn}</td>
                    <td>{a.branch}</td>
                    <td>{a.cgpa ?? '—'}</td>
                    <td>{a.gender}</td>
                    <td>{a.verified ? <span className="tag eligible">Verified</span> : <span className="tag status">Pending</span>}</td>
                    <td><a href={`http://localhost:4000/api/files/resume/application/${a.application_id}`} target="_blank" rel="noreferrer">View{a.has_override_resume ? ' (custom)' : ''}</a></td>
                    <td>{formatIST(a.applied_at)}</td>
                    <td>
                      <select value={a.status} onChange={(e) => updateStatus(a.application_id, e.target.value)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
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
