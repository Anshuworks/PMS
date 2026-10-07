import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatIST } from '../dateUtils';

export default function StudentHistory() {
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [withdrawingId, setWithdrawingId] = useState(null);

  useEffect(() => { load(); }, []);

  function load() {
    api.getHistory().then(setHistory).catch((e) => setError(e.message));
  }

  async function withdraw(appId) {
    if (!window.confirm('Withdraw this application?')) return;
    setWithdrawingId(appId);
    setError('');
    try {
      await api.withdrawApplication(appId);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWithdrawingId(null);
    }
  }

  return (
    <div className="page">
      <div className="shell">
        <h1>Application history</h1>
        {error && <div className="error-banner">{error}</div>}
        <div className="card">
          {history.length === 0 ? (
            <p className="muted">You haven't applied to any drives yet.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Company</th><th>Role</th><th>Package</th><th>Status</th><th>Applied on</th><th></th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td><Link to={`/drives/${h.drive_id}`}>{h.company}</Link></td>
                    <td>{h.role}</td>
                    <td>{h.package || '—'}</td>
                    <td><span className="tag status">{h.status}</span></td>
                    <td>{formatIST(h.applied_at)} IST</td>
                    <td>
                      {h.status !== 'Selected' && (
                        <button className="btn btn-ghost" disabled={withdrawingId === h.id} onClick={() => withdraw(h.id)}>
                          {withdrawingId === h.id ? 'Withdrawing…' : 'Withdraw'}
                        </button>
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
