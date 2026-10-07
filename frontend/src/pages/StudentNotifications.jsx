import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function StudentNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setNotifications(await api.getMyNotifications());
    } catch (err) {
      setError(err.message);
    }
  }

  async function markRead(id) {
    try {
      await api.markNotificationRead(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markAllRead() {
    try {
      await api.markAllNotificationsRead();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="page">
      <div className="shell">
        <div className="drive-head">
          <h1>Notifications</h1>
          {unreadCount > 0 && <button className="btn btn-ghost" onClick={markAllRead}>Mark all as read</button>}
        </div>
        {error && <div className="error-banner">{error}</div>}

        {notifications.length === 0 ? (
          <div className="card"><p className="muted">No notifications yet.</p></div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className="card"
              style={{ borderColor: n.is_read ? undefined : 'var(--brand)', cursor: n.is_read ? 'default' : 'pointer' }}
              onClick={() => !n.is_read && markRead(n.id)}
            >
              <div className="drive-head">
                <div>
                  <p style={{ margin: 0, fontFamily: 'Segoe UI, sans-serif', fontSize: '0.9rem' }}>{n.message}</p>
                  {n.company && (
                    <p className="muted" style={{ margin: '6px 0 0' }}>
                      {n.company} — {n.role}
                    </p>
                  )}
                </div>
                {!n.is_read && <span className="tag ineligible">New</span>}
              </div>
              <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>{new Date(n.created_at).toLocaleString()}</p>
            </div>
          ))
        )}

        <p className="muted">
          <Link to="/drives">&larr; Back to drives</Link>
        </p>
      </div>
    </div>
  );
}
