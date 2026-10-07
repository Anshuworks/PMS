import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatIST } from '../dateUtils';

export default function StudentDrives() {
  const [drives, setDrives] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setDrives(await api.getDrives());
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="shell">
        <h1>Active drives</h1>
        <p className="muted">Only drives you're eligible for can be applied to. Ineligible drives show exactly why. Click a drive to review your details before applying.</p>

        {error && <div className="error-banner">{error}</div>}
        {drives.length === 0 && <p className="muted">No drives posted yet.</p>}

        {drives.map((d) => (
          <div className="card" key={d.id}>
            <div className="drive-head">
              <div>
                <h3 style={{ marginBottom: 2 }}>{d.company} — {d.role}</h3>
                <p className="muted" style={{ margin: 0 }}>{d.package || 'Package not disclosed'}</p>
                {d.deadline && <p className="muted" style={{ margin: '4px 0 0' }}>Apply by: {formatIST(d.deadline)} IST</p>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className={`tag ${d.computedStatus === 'open' ? 'eligible' : d.computedStatus === 'expired' ? 'expired' : 'closed'}`}>
                  {d.computedStatus}
                </span>
                <span className={`tag ${d.eligible ? 'eligible' : 'ineligible'}`}>
                  {d.eligible ? 'Eligible' : 'Not eligible'}
                </span>
              </div>
            </div>

            {!d.eligible && d.reasons?.length > 0 && (
              <ul className="reasons">{d.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            )}

            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              {d.hasApplied ? (
                <button className="btn" disabled style={{ background: 'var(--line)', color: 'var(--ink-soft)' }}>Applied</button>
              ) : (
                <Link className="btn" to={`/drives/${d.id}`} style={{ pointerEvents: d.eligible ? 'auto' : 'none', opacity: d.eligible ? 1 : 0.5 }}>
                  Review & apply
                </Link>
              )}
              <Link className="btn btn-ghost" to={`/drives/${d.id}`}>View details & announcements</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
