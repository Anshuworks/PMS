import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { formatIST } from '../dateUtils';

export default function AdminAnnouncements() {
  const { id } = useParams();
  const [announcements, setAnnouncements] = useState([]);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    try {
      setAnnouncements(await api.getAnnouncements(id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function post(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setPosting(true);
    setError('');
    try {
      await api.createAnnouncement(id, message, file);
      setMessage('');
      setFile(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="page">
      <div className="shell">
        <Link to="/admin" className="muted">&larr; Back to drives</Link>
        <h1 style={{ marginTop: 10 }}>Announcements</h1>
        <p className="muted">Posting here notifies (in-app + email) every student who has applied to this drive.</p>

        {error && <div className="error-banner">{error}</div>}

        <div className="card">
          <form onSubmit={post}>
            <div className="field">
              <label>New announcement</label>
              <textarea
                rows="4"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Shortlisted candidates should report to Seminar Hall 2 at 10 AM tomorrow with a laptop."
              />
            </div>
            <div className="field" style={{ maxWidth: 360 }}>
              <label>Attach a file (optional — shortlist sheet, image, PDF, up to 15MB)</label>
              <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} />
            </div>
            <button className="btn" type="submit" disabled={posting || !message.trim()}>
              {posting ? 'Posting…' : 'Post announcement'}
            </button>
          </form>
        </div>

        {announcements.length === 0 ? (
          <div className="card"><p className="muted">No announcements posted yet.</p></div>
        ) : (
          announcements.map((a) => (
            <div className="card" key={a.id}>
              <p style={{ margin: 0, fontFamily: 'Segoe UI, sans-serif', fontSize: '0.9rem' }}>{a.message}</p>
              {a.attachmentUrl && (
                <p style={{ marginTop: 8, marginBottom: 0 }}>
                  <a href={a.attachmentUrl} target="_blank" rel="noreferrer">📎 View attachment</a>
                </p>
              )}
              <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>{formatIST(a.created_at)} IST</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
