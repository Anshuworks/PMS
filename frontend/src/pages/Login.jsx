import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

// Three login tabs: student, TNP Admin (superadmin), Coordinator. The
// latter two both authenticate against the same /auth/login endpoint with
// role: 'admin' (coordinators and superadmins live in the same admins
// table) — the tab is purely about presenting a separate, clearly-labelled
// entry point for coordinators. After login, we double-check the
// account's actual adminRole matches the tab that was used, so a
// coordinator can't log in through the "TNP Admin" tab or vice versa.
const PANELS = {
  student: { label: 'Student', backendRole: 'student' },
  admin: { label: 'TNP Admin', backendRole: 'admin', expectedAdminRole: 'superadmin' },
  coordinator: { label: 'Coordinator', backendRole: 'admin', expectedAdminRole: 'coordinator' },
};

export default function Login() {
  // mode: 'login' | 'register' | 'forgot-request' | 'forgot-reset'
  const [mode, setMode] = useState('login');
  const [panel, setPanel] = useState('student');
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const panelConfig = PANELS[panel];

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function selectPanel(newPanel) {
    setPanel(newPanel);
    setError('');
    setInfo('');
    // Admins and coordinators can only log in — there is no
    // self-registration for either role, so force login mode when switching.
    if (newPanel !== 'student' && mode === 'register') setMode('login');
  }

  function identifierValue() {
    return panel === 'student' ? form.identifierPrn : form.identifierEmail;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        const identifier = panel === 'student' ? form.prn : form.email;
        const data = await api.login({ identifier, password: form.password, role: panelConfig.backendRole });

        if (panelConfig.expectedAdminRole && data.user?.role !== panelConfig.expectedAdminRole) {
          setError(
            panelConfig.expectedAdminRole === 'superadmin'
              ? 'This is a coordinator account — please use the Coordinator tab.'
              : 'This is a superadmin account — please use the TNP Admin tab.'
          );
          return;
        }

        login(data.token, data.user, panelConfig.backendRole, data.user?.adminRole ?? data.user?.role);
        navigate(panelConfig.backendRole === 'admin' ? '/admin' : '/drives');
        return;
      }

      if (mode === 'register') {
        // Registration is student-only.
        const data = await api.registerStudent(form);
        login(data.token, { id: data.id, name: form.name, prn: form.prn }, 'student');
        navigate('/drives');
        return;
      }

      if (mode === 'forgot-request') {
        const identifier = panel === 'student' ? form.identifierPrn : form.identifierEmail;
        if (!identifier) { setError(panel === 'student' ? 'Enter your PRN' : 'Enter your email'); return; }
        await api.forgotPassword(identifier, panelConfig.backendRole);
        setInfo('If that account exists, an OTP has been sent to the registered email. Enter it below along with a new password.');
        setMode('forgot-reset');
        return;
      }

      if (mode === 'forgot-reset') {
        const identifier = panel === 'student' ? form.identifierPrn : form.identifierEmail;
        if (!form.otp || !form.newPassword) { setError('Enter the OTP and a new password'); return; }
        await api.resetPassword(identifier, panelConfig.backendRole, form.otp, form.newPassword);
        setInfo('Password updated — sign in with your new password.');
        setMode('login');
        setForm({});
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="shell auth-shell">
        <h1>
          {mode === 'login' && 'Sign in'}
          {mode === 'register' && 'Create an account'}
          {mode === 'forgot-request' && 'Reset your password'}
          {mode === 'forgot-reset' && 'Enter OTP & new password'}
        </h1>
        <p className="muted">
          {panel === 'student' ? 'Student portal' : panel === 'admin' ? 'TNP Admin login' : 'Coordinator login'}
        </p>

        <div className="card">
          {error && <div className="error-banner">{error}</div>}
          {info && !error && (
            <p style={{ color: 'var(--green)', fontFamily: 'Segoe UI, sans-serif', fontSize: '0.88rem', marginTop: 0 }}>{info}</p>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div className="row" style={{ marginBottom: 16 }}>
              {Object.entries(PANELS).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  className={panel === key ? 'btn' : 'btn btn-ghost'}
                  onClick={() => selectPanel(key)}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="field"><label>Full name</label><input required onChange={(e) => update('name', e.target.value)} /></div>
            )}

            {(mode === 'login' || mode === 'register') && (
              panel === 'student' ? (
                <div className="field"><label>PRN</label><input required onChange={(e) => update('prn', e.target.value)} /></div>
              ) : (
                <div className="field"><label>Email</label><input required type="email" onChange={(e) => update('email', e.target.value)} /></div>
              )
            )}

            {(mode === 'forgot-request' || mode === 'forgot-reset') && (
              panel === 'student' ? (
                <div className="field">
                  <label>PRN</label>
                  <input required value={form.identifierPrn || ''} disabled={mode === 'forgot-reset'} onChange={(e) => update('identifierPrn', e.target.value)} />
                </div>
              ) : (
                <div className="field">
                  <label>Email</label>
                  <input required type="email" value={form.identifierEmail || ''} disabled={mode === 'forgot-reset'} onChange={(e) => update('identifierEmail', e.target.value)} />
                </div>
              )
            )}

            {mode === 'register' && (
              <>
                <div className="field"><label>Branch</label><input required placeholder="e.g. CSE" onChange={(e) => update('branch', e.target.value)} /></div>
                <div className="field"><label>Personal email</label><input required type="email" onChange={(e) => update('personal_email', e.target.value)} /></div>
                <div className="field"><label>Phone number</label><input required onChange={(e) => update('phone', e.target.value)} /></div>
              </>
            )}

            {(mode === 'login' || mode === 'register') && (
              <div className="field">
                <label>Password</label>
                <input required type="password" onChange={(e) => update('password', e.target.value)} />
              </div>
            )}

            {mode === 'forgot-reset' && (
              <>
                <div className="field"><label>OTP (check your registered email)</label><input required value={form.otp || ''} onChange={(e) => update('otp', e.target.value)} /></div>
                <div className="field"><label>New password</label><input required type="password" value={form.newPassword || ''} onChange={(e) => update('newPassword', e.target.value)} /></div>
              </>
            )}

            {mode === 'register' && (
              <p className="muted" style={{ marginTop: -6 }}>
                Everything else — academics, documents, resume — is filled in on your Profile page after you log in.
              </p>
            )}

            <button className="btn" type="submit" style={{ width: '100%', marginTop: 8 }}>
              {mode === 'login' && 'Sign in'}
              {mode === 'register' && 'Create account'}
              {mode === 'forgot-request' && 'Send OTP'}
              {mode === 'forgot-reset' && 'Reset password'}
            </button>
          </form>
        </div>

        {mode === 'login' && (
          <p className="muted">
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot-request'); setError(''); setInfo(''); setForm({}); }}>
              Forgot password?
            </a>
          </p>
        )}

        {(mode === 'forgot-request' || mode === 'forgot-reset') && (
          <p className="muted">
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setError(''); setInfo(''); setForm({}); }}>
              &larr; Back to sign in
            </a>
          </p>
        )}

        {mode === 'login' && panel === 'student' && (
          <p className="muted">
            Don't have an account?{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); setError(''); }}>Register</a>
          </p>
        )}
        {mode === 'register' && (
          <p className="muted">
            Already registered?{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setError(''); }}>Sign in</a>
          </p>
        )}
        {mode === 'login' && panel === 'coordinator' && (
          <p className="muted">Coordinator accounts are created by TNP Admin — there is no self-registration.</p>
        )}
        {mode === 'login' && panel === 'admin' && (
          <p className="muted">The first TNP Admin account is created once, directly on the server, before anyone can log in.</p>
        )}
      </div>
    </div>
  );
}
