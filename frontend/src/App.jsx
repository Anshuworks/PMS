import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { api } from './api';
import Login from './pages/Login';
import StudentDrives from './pages/StudentDrives';
import StudentDriveDetail from './pages/StudentDriveDetail';
import StudentHistory from './pages/StudentHistory';
import StudentProfile from './pages/StudentProfile';
import StudentNotifications from './pages/StudentNotifications';
import AdminDashboard from './pages/AdminDashboard';
import AdminApplicants from './pages/AdminApplicants';
import AdminAnnouncements from './pages/AdminAnnouncements';
import MasterDatabase from './pages/MasterDatabase';
import HelpPage from './pages/HelpPage';
import AuditLog from './pages/AuditLog';

function Protected({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  return children;
}

function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    if (user?.role !== 'student') return;
    let cancelled = false;
    async function poll() {
      try {
        const { count } = await api.getUnreadNotificationCount();
        if (!cancelled) setUnread(count);
      } catch {
        // ignore — nav badge isn't critical
      }
    }
    poll();
    const interval = setInterval(poll, 30000); // refresh every 30s
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.role]);

  return (
    <div className="topbar">
      <div className="topbar-inner">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <div className="brandmark">
            {!logoFailed ? (
              <img src="http://localhost:4000/branding/logo.png" alt="Logo" className="brand-logo" onError={() => setLogoFailed(true)} />
            ) : (
              <span className="brand-logo-placeholder">LOGO</span>
            )}
            Training and Placement Cell
          </div>
        </Link>
        <div className="nav-ui">
          {user?.role === 'student' && (
            <>
              <Link to="/drives">Drives</Link>
              <Link to="/history">History</Link>
              <Link to="/profile">Profile</Link>
              <Link to="/notifications">
                Notifications{unread > 0 ? ` (${unread})` : ''}
              </Link>
              <Link to="/help">Help</Link>
            </>
          )}
          {user?.role === 'admin' && (
            <>
              <Link to="/admin">Dashboard</Link>
              <Link to="/admin/students">Master DB</Link>
              <Link to="/help">Help</Link>
              {user.adminRole === 'superadmin' && <Link to="/admin/audit-log">Audit Log</Link>}
            </>
          )}
          {user ? (
            <>
              <span className="muted">{user.name}</span>
              <button onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
            </>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Home() {
  const { user } = useAuth();
  if (user?.role === 'student') return <Navigate to="/drives" replace />;
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Topbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/drives" element={<Protected role="student"><StudentDrives /></Protected>} />
          <Route path="/drives/:id" element={<Protected role="student"><StudentDriveDetail /></Protected>} />
          <Route path="/history" element={<Protected role="student"><StudentHistory /></Protected>} />
          <Route path="/profile" element={<Protected role="student"><StudentProfile /></Protected>} />
          <Route path="/notifications" element={<Protected role="student"><StudentNotifications /></Protected>} />
          <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
          <Route path="/admin/students" element={<Protected role="admin"><MasterDatabase /></Protected>} />
          <Route path="/admin/audit-log" element={<Protected role="admin"><AuditLog /></Protected>} />
          <Route path="/admin/drives/:id" element={<Protected role="admin"><AdminApplicants /></Protected>} />
          <Route path="/admin/drives/:id/announcements" element={<Protected role="admin"><AdminAnnouncements /></Protected>} />
          <Route path="/help" element={<Protected><HelpPage /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
