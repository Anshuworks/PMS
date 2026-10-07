import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { formatIST } from '../dateUtils';

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
      <span className="muted" style={{ fontSize: '0.85rem' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', textAlign: 'right' }}>{value ?? '—'}</span>
    </div>
  );
}

function ApplyPreview({ drive, profile, onCancel, onSubmit, submitting, error }) {
  const [resumeFile, setResumeFile] = useState(null);
  const [customResponses, setCustomResponses] = useState({});
  const [externalConfirmed, setExternalConfirmed] = useState(false);
  const customFields = drive.custom_fields || [];

  function updateResponse(label, value) {
    setCustomResponses((r) => ({ ...r, [label]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ resumeFile, customResponses, externalConfirmed });
  }

  const canSubmit =
    (!drive.external_link || externalConfirmed) &&
    customFields.every((f) => customResponses[f.label]?.trim());

  return (
    <div className="card" style={{ borderColor: 'var(--brand)' }}>
      <h3 style={{ marginTop: 0 }}>Review before applying</h3>
      <p className="muted" style={{ marginTop: -6 }}>
        Double-check everything below — you can fix anything wrong on your Profile page first, then come back.
      </p>

      <h3 style={{ fontSize: '0.95rem' }}>Personal</h3>
      <DetailRow label="Name" value={profile.name} />
      <DetailRow label="PRN" value={profile.prn} />
      <DetailRow label="Branch" value={profile.branch} />
      <DetailRow label="Gender" value={profile.gender} />
      <DetailRow label="Date of birth" value={profile.dob} />
      <DetailRow label="Age" value={profile.age} />
      <DetailRow label="Current year" value={profile.current_year} />
      <DetailRow label="Personal email" value={profile.personal_email} />
      <DetailRow label="College email" value={profile.college_email} />
      <DetailRow label="Phone" value={profile.phone} />
      <DetailRow label="WhatsApp number" value={profile.whatsapp_number} />

      <h3 style={{ fontSize: '0.95rem', marginTop: 18 }}>Academics</h3>
      <DetailRow label="10th board / %" value={profile.tenth_board ? `${profile.tenth_board} / ${profile.tenth_percentage}%` : null} />
      <DetailRow label="12th/Diploma" value={profile.twelfth_or_diploma_name ? `${profile.twelfth_or_diploma_type} — ${profile.twelfth_or_diploma_name} / ${profile.twelfth_or_diploma_percentage}%` : null} />
      <DetailRow label="College" value={profile.college_name} />
      <DetailRow label="Degree" value={profile.degree} />
      <DetailRow label="College passing year" value={profile.college_passing_year} />
      <DetailRow label="Aggregate CGPA" value={profile.cgpa} />
      <DetailRow
        label="Semester SGPAs"
        value={[1, 2, 3, 4, 5, 6, 7].map((n) => profile[`sem${n}_sgpa`]).filter((v) => v != null).join(', ') || null}
      />
      <DetailRow label="Active / dead backlogs" value={`${profile.backlogs_active ?? 0} / ${profile.backlogs_dead ?? 0}`} />
      <DetailRow label="Year gap" value={profile.year_gap ? `${profile.year_gap} year(s) — ${profile.year_gap_reason || 'no reason given'}` : 'None'} />

      {(profile.current_address || profile.parent_name) && (
        <>
          <h3 style={{ fontSize: '0.95rem', marginTop: 18 }}>Additional details</h3>
          <DetailRow label="Current address" value={profile.current_address} />
          <DetailRow label="Permanent address" value={profile.permanent_address} />
          <DetailRow label="Parent/guardian" value={profile.parent_name} />
          <DetailRow label="Parent contact" value={profile.parent_contact_number} />
        </>
      )}

      <div className="field" style={{ marginTop: 18 }}>
        <label>Resume for this application</label>
        {profile.resume_filename && (
          <p className="muted" style={{ margin: '4px 0' }}>
            Default resume on file: <strong>{profile.resume_filename}</strong>{' '}
            <a href={`http://localhost:4000/api/files/resume/student/${profile.id}`} target="_blank" rel="noreferrer">(view)</a>
          </p>
        )}
        {!profile.resume_filename && <p className="muted" style={{ margin: '4px 0', color: 'var(--red)' }}>No resume on file yet — upload one on your Profile page.</p>}
        {resumeFile && (
          <p className="muted" style={{ margin: '4px 0', color: 'var(--green)' }}>Will use instead for this application: <strong>{resumeFile.name}</strong></p>
        )}
        <input type="file" accept=".pdf,.txt" onChange={(e) => setResumeFile(e.target.files[0] || null)} />
        <p className="muted" style={{ marginTop: 4 }}>Optional — upload a different resume just for this company without changing your profile default.</p>
      </div>

      {customFields.length > 0 && (
        <>
          <h3 style={{ fontSize: '1rem' }}>This company also needs:</h3>
          {customFields.map((f) => (
            <div className="field" key={f.label}>
              <label>{f.label}</label>
              {f.type === 'select' ? (
                <select value={customResponses[f.label] || ''} onChange={(e) => updateResponse(f.label, e.target.value)}>
                  <option value="">Select</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={customResponses[f.label] || ''} onChange={(e) => updateResponse(f.label, e.target.value)} />
              )}
            </div>
          ))}
        </>
      )}

      {drive.external_link && (
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={externalConfirmed} onChange={(e) => setExternalConfirmed(e.target.checked)} style={{ width: 'auto' }} />
          <span>I confirm I have also applied at <a href={drive.external_link} target="_blank" rel="noreferrer">the company's external form</a></span>
        </label>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {submitting ? 'Submitting…' : 'Confirm & Submit Application'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
    </div>
  );
}

export default function StudentDriveDetail() {
  const { id } = useParams();
  const [drive, setDrive] = useState(null);
  const [profile, setProfile] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [applicationId, setApplicationId] = useState(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    try {
      const [drives, ann, history, myProfile] = await Promise.all([
        api.getDrives(), api.getAnnouncements(id), api.getHistory(), api.getMyProfile(),
      ]);
      setDrive(drives.find((d) => String(d.id) === id) || null);
      setAnnouncements(ann);
      setProfile(myProfile);
      const matchingApp = history.find((h) => String(h.drive_id) === id);
      setApplicationId(matchingApp?.id ?? null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitApplication({ resumeFile, customResponses, externalConfirmed }) {
    setSubmitting(true);
    setPreviewError('');
    try {
      await api.applyToDrive(id, { resumeFile, customResponses, externalConfirmed });
      setShowPreview(false);
      await load();
    } catch (err) {
      setPreviewError(err.message + (err.reasons ? ': ' + err.reasons.join('; ') : ''));
    } finally {
      setSubmitting(false);
    }
  }

  async function withdraw() {
    if (!applicationId) return;
    if (!window.confirm('Withdraw your application to this drive?')) return;
    setWithdrawing(true);
    setError('');
    try {
      await api.withdrawApplication(applicationId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWithdrawing(false);
    }
  }

  if (!drive || !profile) {
    return (
      <div className="page">
        <div className="shell">
          {error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>}
          <Link to="/drives" className="muted">&larr; Back to drives</Link>
        </div>
      </div>
    );
  }

  const statusTagClass = drive.computedStatus === 'open' ? 'eligible' : drive.computedStatus === 'expired' ? 'expired' : 'closed';

  return (
    <div className="page">
      <div className="shell">
        <Link to="/drives" className="muted">&larr; Back to drives</Link>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="drive-head">
            <div>
              <h1 style={{ marginBottom: 2 }}>{drive.company} — {drive.role}</h1>
              <p className="muted" style={{ margin: 0 }}>{drive.package || 'Package not disclosed'}</p>
              {drive.deadline && <p className="muted" style={{ margin: '4px 0 0' }}>Apply by: {formatIST(drive.deadline)} IST</p>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className={`tag ${statusTagClass}`}>{drive.computedStatus}</span>
              <span className={`tag ${drive.eligible ? 'eligible' : 'ineligible'}`}>
                {drive.eligible ? 'Eligible' : 'Not eligible'}
              </span>
            </div>
          </div>

          {drive.description && <p style={{ marginTop: 14 }}>{drive.description}</p>}
          {drive.extra_notes && <p className="muted" style={{ marginTop: 8 }}>{drive.extra_notes}</p>}
          {drive.external_link && (
            <p style={{ marginTop: 8 }}>
              <a href={drive.external_link} target="_blank" rel="noreferrer">🔗 Apply externally</a>
            </p>
          )}

          {!drive.eligible && drive.reasons?.length > 0 && (
            <ul className="reasons">{drive.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          )}

          {error && <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>}

          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            {drive.hasApplied ? (
              <>
                <button className="btn" disabled style={{ background: 'var(--line)', color: 'var(--ink-soft)' }}>Applied</button>
                {applicationId && (
                  <button className="btn btn-danger" disabled={withdrawing} onClick={withdraw}>
                    {withdrawing ? 'Withdrawing…' : 'Withdraw application'}
                  </button>
                )}
              </>
            ) : (
              !showPreview && (
                <button className="btn" disabled={!drive.eligible} onClick={() => setShowPreview(true)}>
                  Apply now
                </button>
              )
            )}
          </div>
        </div>

        {showPreview && !drive.hasApplied && (
          <ApplyPreview
            drive={drive}
            profile={profile}
            onCancel={() => setShowPreview(false)}
            onSubmit={submitApplication}
            submitting={submitting}
            error={previewError}
          />
        )}

        <h1>Announcements</h1>
        {announcements.length === 0 ? (
          <div className="card"><p className="muted">No announcements yet for this drive.</p></div>
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
