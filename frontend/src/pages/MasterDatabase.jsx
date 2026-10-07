import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { formatIST } from '../dateUtils';

export default function MasterDatabase() {
  const { user } = useAuth();
  const isSuperadmin = user?.adminRole === 'superadmin';

  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const [coordinators, setCoordinators] = useState([]);
  const [coordForm, setCoordForm] = useState({ name: '', email: '', password: '' });
  const [coordMsg, setCoordMsg] = useState('');

  useEffect(() => {
    load();
    if (isSuperadmin) loadCoordinators();
  }, []);

  async function load() {
    try {
      setStudents(await api.getMasterDatabase());
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadCoordinators() {
    try {
      setCoordinators(await api.getCoordinators());
    } catch (err) {
      setError(err.message);
    }
  }

  async function verify(id) {
    try {
      await api.verifyStudent(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function downloadMasterSheet() {
    try {
      const csv = await api.exportMasterSheet();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'master-sheet.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createCoordinator(e) {
    e.preventDefault();
    setError('');
    setCoordMsg('');
    try {
      await api.createCoordinator(coordForm);
      setCoordForm({ name: '', email: '', password: '' });
      setCoordMsg('Coordinator account created.');
      loadCoordinators();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeCoordinator(id, name) {
    if (!window.confirm(`Delete ${name}'s coordinator account? This can't be undone (their past drives/verifications stay, just unattributed).`)) return;
    try {
      await api.deleteCoordinator(id);
      loadCoordinators();
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = students.filter((s) => {
    const q = filter.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.prn.toLowerCase().includes(q) || s.branch?.toLowerCase().includes(q);
  });

  return (
    <div className="page">
      <div className="shell">
        <div className="drive-head">
          <h1>Master database</h1>
          <button className="btn btn-ghost" onClick={downloadMasterSheet}>Export master sheet (CSV)</button>
        </div>
        <p className="muted">Every registered student, with computed CGPA and profile status. Verify after manually checking submitted details.</p>

        {error && <div className="error-banner">{error}</div>}

        {isSuperadmin && (
          <div className="card">
            <h3>Coordinator accounts</h3>
            <p className="muted" style={{ marginTop: -6 }}>Coordinators can't self-register — create their accounts here.</p>
            {coordMsg && <p style={{ color: 'var(--green)', fontFamily: 'Segoe UI, sans-serif', fontSize: '0.88rem' }}>{coordMsg}</p>}
            <form onSubmit={createCoordinator}>
              <div className="row">
                <div className="field"><label>Name</label><input required value={coordForm.name} onChange={(e) => setCoordForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div className="field"><label>Email</label><input required type="email" value={coordForm.email} onChange={(e) => setCoordForm((f) => ({ ...f, email: e.target.value }))} /></div>
                <div className="field"><label>Temporary password</label><input required type="password" value={coordForm.password} onChange={(e) => setCoordForm((f) => ({ ...f, password: e.target.value }))} /></div>
              </div>
              <button className="btn" type="submit">Create coordinator</button>
            </form>
            {coordinators.length > 0 && (
              <table style={{ marginTop: 16 }}>
                <thead><tr><th>Name</th><th>Email</th><th>Created</th><th></th></tr></thead>
                <tbody>
                  {coordinators.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.email}</td>
                      <td>{formatIST(c.created_at)}</td>
                      <td><button className="btn btn-danger" onClick={() => removeCoordinator(c.id, c.name)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="card">
          <div className="field" style={{ maxWidth: 320 }}>
            <label>Search by name, PRN, or branch</label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>

          {filtered.length === 0 ? (
            <p className="muted">No students found.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>PRN</th><th>Branch</th><th>CGPA</th><th>Backlogs (A/D)</th>
                  <th>Profile</th><th>Verified</th><th>Placed</th><th>Resume</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.prn}</td>
                    <td>{s.branch}</td>
                    <td>{s.cgpa ?? '—'}</td>
                    <td>{s.backlogs_active ?? '—'} / {s.backlogs_dead ?? '—'}</td>
                    <td>
                      {s.profile_locked
                        ? <span className="tag eligible">Locked</span>
                        : s.profileComplete
                          ? <span className="tag status">Complete, not locked</span>
                          : <span className="tag ineligible">Incomplete</span>}
                    </td>
                    <td>{s.verified ? <span className="tag eligible">Verified</span> : <span className="tag status">Pending</span>}</td>
                    <td>{s.isPlaced ? <span className="tag eligible">Placed</span> : <span className="muted">No</span>}</td>
                    <td>{s.resume_filename ? 'Yes' : 'No'}</td>
                    <td>
                      {isSuperadmin ? (
                        <span className="muted">View only</span>
                      ) : (
                        !s.verified && (
                          s.profile_locked
                            ? <button className="btn btn-ghost" onClick={() => verify(s.id)}>Verify</button>
                            : <span className="muted">Not locked yet</span>
                        )
                      )}
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
