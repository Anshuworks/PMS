import { useEffect, useState } from 'react';
import { api } from '../api';

function Field({ label, field, profile, draft, setDraft, locked, type = 'text', ...props }) {
  const value = draft[field] ?? profile[field] ?? '';
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        disabled={locked}
        onChange={(e) => {
          const raw = e.target.value;
          // Never let a temporarily-empty number field collapse to NaN — that
          // silently serializes to null and gets dropped by the server,
          // making it look like the save worked when nothing was written.
          const parsed = type === 'number' ? (raw === '' ? undefined : parseFloat(raw)) : raw;
          setDraft((d) => ({ ...d, [field]: parsed }));
        }}
        {...props}
      />
    </div>
  );
}

export default function StudentProfile() {
  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeStatus, setResumeStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(null);
  const [ocrSuggestion, setOcrSuggestion] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api.getMyProfile();
      setProfile(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveAll(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      const result = await api.updateMyProfile(draft);
      setDraft({});
      setSaved(true);
      await load();
      if (result.rejectedFields?.length) {
        setError(`These fields are already locked and were not changed: ${result.rejectedFields.join(', ')}`);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmProfile() {
    setError('');
    setConfirming(true);
    try {
      // Save any unsaved draft first, so nothing typed gets lost right before confirming.
      if (Object.keys(draft).length > 0) {
        await api.updateMyProfile(draft);
        setDraft({});
      }
      const result = await api.confirmProfile();
      await load();
      if (result.alreadyLocked) setError('Your profile was already confirmed and locked.');
    } catch (err) {
      setError(err.message + (err.missing ? `: missing ${err.missing.join(', ')}` : ''));
    } finally {
      setConfirming(false);
    }
  }

  async function uploadResume(e) {
    e.preventDefault();
    if (!resumeFile) return;
    setUploading(true);
    setError('');
    try {
      const data = await api.uploadResume(resumeFile);
      setResumeStatus(`Uploaded "${data.filename}" — extracted ${data.extractedChars} characters.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function runOcr(field, file) {
    if (!file) return;
    setOcrBusy(field);
    setError('');
    setOcrSuggestion(null);
    try {
      const result = await api.ocrSemesterMarksheet(file);
      if (result.suggestedSgpa == null) {
        setError('Could not confidently read an SGPA from that image — enter it manually below.');
      } else {
        setOcrSuggestion({ field, value: result.suggestedSgpa });
      }
    } catch (err) {
      setError(err.message + ' — enter the SGPA manually below.');
    } finally {
      setOcrBusy(null);
    }
  }

  function acceptOcrSuggestion() {
    setDraft((d) => ({ ...d, [ocrSuggestion.field]: ocrSuggestion.value }));
    setOcrSuggestion(null);
  }

  if (!profile) return <div className="page"><div className="shell">Loading…</div></div>;

  const locked = !!profile.profile_locked;
  const verified = !!profile.verified;
  // "Next fillable" semester looks at draft OR saved profile, so you can type
  // sem1, sem2, sem3, sem4 all in the same sitting before hitting Save.
  const effective = (f) => draft[f] ?? profile[f];
  const nextUnfilledSemIndex = [1, 2, 3, 4, 5, 6, 7].find((n) => effective(`sem${n}_sgpa`) == null) ?? 8;

  return (
    <div className="page">
      <div className="shell" style={{ maxWidth: 720 }}>
        <h1>My profile</h1>
        <p className="muted">
          {locked ? (
            <span style={{ color: 'var(--green)' }}>
              Your profile is confirmed and locked. You can apply to drives, and you can still add
              semester 5, 6, 7 SGPA below as each result is announced.
            </span>
          ) : (
            <>
              Fill in your details below — save as many times as you like. Once every mandatory field
              is filled, use <strong>Confirm &amp; Lock Profile</strong> to finalize it (only then can you apply to drives).
              {!profile.profileComplete && profile.missingFields?.length > 0 && (
                <span> Still missing: {profile.missingFields.join(', ')}.</span>
              )}
            </>
          )}
          {profile.verified ? <span className="tag eligible" style={{ marginLeft: 10 }}>Verified</span> : <span className="tag status" style={{ marginLeft: 10 }}>Pending verification</span>}
        </p>

        {error && <div className="error-banner">{error}</div>}
        {saved && <div className="card" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>Progress saved.</div>}

        <form onSubmit={saveAll}>
          <div className="card">
            <h3>Basic details</h3>
            <div className="row">
              <div className="field"><label>Name</label><input value={profile.name} disabled /></div>
              <div className="field"><label>PRN</label><input value={profile.prn} disabled /></div>
              <div className="field"><label>Branch</label><input value={profile.branch} disabled /></div>
            </div>
            <div className="row">
              <Field label="College email" field="college_email" type="email" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="College name" field="college_name" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="WhatsApp number" field="whatsapp_number" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
            </div>
            <div className="row">
              <div className="field">
                <label>Gender</label>
                <select
                  value={draft.gender ?? profile.gender ?? ''}
                  disabled={locked}
                  onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}
                >
                  <option value="">Select</option>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <Field label="Date of birth" field="dob" type="date" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <div className="field"><label>Age (auto-calculated from DOB)</label><input value={profile.age ?? ''} disabled /></div>
            </div>
            <div className="row">
              <Field label="Aadhar number" field="aadhar_no" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="PAN number" field="pan_no" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <div className="field">
                <label>Current year</label>
                <select
                  value={draft.current_year ?? profile.current_year ?? ''}
                  disabled={locked}
                  onChange={(e) => setDraft((d) => ({ ...d, current_year: e.target.value === '' ? undefined : parseInt(e.target.value) }))}
                >
                  <option value="">Select</option>
                  <option value="2">2nd year</option><option value="3">3rd year</option><option value="4">4th year</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Academics — schooling</h3>
            <div className="row">
              <Field label="10th board" field="tenth_board" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="10th %" field="tenth_percentage" type="number" step="0.01" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="10th passing year" field="tenth_passing_year" type="number" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
            </div>
            <div className="row">
              <div className="field">
                <label>Type</label>
                <select
                  value={draft.twelfth_or_diploma_type ?? profile.twelfth_or_diploma_type ?? ''}
                  disabled={locked}
                  onChange={(e) => setDraft((d) => ({ ...d, twelfth_or_diploma_type: e.target.value }))}
                >
                  <option value="">Select</option>
                  <option value="12th">12th</option>
                  <option value="Diploma">Diploma</option>
                </select>
              </div>
              <Field label="12th board / Diploma college" field="twelfth_or_diploma_name" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="12th % / Diploma %" field="twelfth_or_diploma_percentage" type="number" step="0.01" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="12th/Diploma passing year" field="twelfth_passing_year" type="number" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
            </div>
          </div>

          <div className="card">
            <h3>Academics — college</h3>
            <div className="row">
              <Field label="College passing year" field="college_passing_year" type="number" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="Active backlogs" field="backlogs_active" type="number" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="Dead backlogs" field="backlogs_dead" type="number" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
              <Field label="Year gap" field="year_gap" type="number" profile={profile} draft={draft} setDraft={setDraft} locked={locked} />
            </div>

            <h3 style={{ fontSize: '1rem', marginTop: 18 }}>Semester SGPA</h3>
            <p className="muted" style={{ marginTop: -6 }}>
              Semesters 1–4 are mandatory. Semesters 5–7 are optional but must be filled in order —
              your overall CGPA is calculated from however many semesters you've entered. You can fill
              several semesters before saving.
            </p>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => {
              const field = `sem${n}_sgpa`;
              const mandatory = n <= 4;
              const alreadyFilled = profile[field] != null;
              const isNextOrFilled = n <= nextUnfilledSemIndex; // this one, or an earlier one already filled
              // Mandatory semesters (1-4) behave like every other core
              // field: freely editable/re-editable until the profile is
              // confirmed, THEN frozen. Optional semesters (5-7) are
              // individually fill-once regardless of the overall lock, so
              // results that arrive later can still be added — but once
              // set, that one field is final.
              const disabled = mandatory
                ? (locked || !isNextOrFilled)
                : (alreadyFilled || !isNextOrFilled);
              return (
                <div key={n} className="row" style={{ alignItems: 'end' }}>
                  <div className="field">
                    <label>Semester {n} SGPA {mandatory ? '(mandatory)' : '(optional)'}</label>
                    <input
                      type="number" step="0.01"
                      value={draft[field] ?? profile[field] ?? ''}
                      disabled={disabled}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setDraft((d) => ({ ...d, [field]: raw === '' ? undefined : parseFloat(raw) }));
                      }}
                    />
                  </div>
                  {!disabled && n === nextUnfilledSemIndex && (
                    <div className="field" style={{ flex: 'none' }}>
                      <label>Or scan marksheet (OCR)</label>
                      <input
                        type="file" accept=".png,.jpg,.jpeg"
                        disabled={ocrBusy === field}
                        onChange={(e) => runOcr(field, e.target.files[0])}
                      />
                    </div>
                  )}
                  {!alreadyFilled && !mandatory && !isNextOrFilled && (
                    <p className="muted" style={{ marginBottom: 10 }}>Fill semester {nextUnfilledSemIndex} first</p>
                  )}
                </div>
              );
            })}
            {ocrBusy && <p className="muted">Reading marksheet — this can take a few seconds…</p>}
            {ocrSuggestion && (
              <div className="card" style={{ background: '#F6F4EC', marginTop: 8 }}>
                <p style={{ margin: 0, fontFamily: 'Segoe UI, sans-serif', fontSize: '0.9rem' }}>
                  OCR suggests <strong>SGPA {ocrSuggestion.value}</strong> for semester {ocrSuggestion.field.replace(/\D/g, '')}.
                  Double check against the marksheet before accepting.
                </p>
                <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                  <button type="button" className="btn" onClick={acceptOcrSuggestion}>Use this value</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setOcrSuggestion(null)}>Enter manually instead</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
            <button className="btn btn-ghost" type="submit">Save progress</button>
            {!locked && (
              <button
                type="button"
                className="btn"
                disabled={confirming}
                onClick={confirmProfile}
              >
                {confirming ? 'Confirming…' : 'Confirm & Lock Profile'}
              </button>
            )}
          </div>
        </form>

        <h1>Additional details</h1>
        <p className="muted">
          Optional — not required to apply. Fill these any time, even before or after your main
          profile is locked. They freeze only once a coordinator manually verifies your account.
        </p>
        <form onSubmit={saveAll}>
          <div className="card">
            <div className="row">
              <div className="field">
                <label>Appearing for</label>
                <select
                  value={draft.appearing_for ?? profile.appearing_for ?? ''}
                  disabled={verified}
                  onChange={(e) => setDraft((d) => ({ ...d, appearing_for: e.target.value }))}
                >
                  <option value="">Select</option>
                  <option value="Placement">Placement</option>
                  <option value="Higher Studies">Higher Studies</option>
                </select>
              </div>
              <Field label="Undergraduate degree (e.g. B.Tech)" field="degree" profile={profile} draft={draft} setDraft={setDraft} locked={verified} />
              <Field label="Reason for education gap (if any)" field="year_gap_reason" profile={profile} draft={draft} setDraft={setDraft} locked={verified} placeholder="NA if none" />
            </div>
            <div className="row">
              <Field label="Current address" field="current_address" profile={profile} draft={draft} setDraft={setDraft} locked={verified} />
              <Field label="Permanent address" field="permanent_address" profile={profile} draft={draft} setDraft={setDraft} locked={verified} />
            </div>
            <div className="row">
              <Field label="Parent/guardian name" field="parent_name" profile={profile} draft={draft} setDraft={setDraft} locked={verified} />
              <Field label="Parent/guardian contact number" field="parent_contact_number" profile={profile} draft={draft} setDraft={setDraft} locked={verified} />
              <Field label="Parent/guardian email" field="parent_email" type="email" profile={profile} draft={draft} setDraft={setDraft} locked={verified} />
            </div>
            {!verified && <button className="btn btn-ghost" type="submit">Save additional details</button>}
            {verified && <p className="muted">These are locked because your account has been verified by the placement office.</p>}
          </div>
        </form>

        <h1>Resume</h1>
        <p className="muted">Upload a PDF or TXT resume. Required before you can apply to any drive. Can be replaced any time, even after your profile is locked.</p>
        <div className="card">
          {profile.resume_filename && (
            <p className="muted" style={{ marginBottom: 12 }}>
              Current resume: <strong>{profile.resume_filename}</strong>{' '}
              <a href={`http://localhost:4000/api/files/resume/student/${profile.id}`} target="_blank" rel="noreferrer">(view)</a>
            </p>
          )}
          {resumeStatus && <p style={{ color: 'var(--green)', fontFamily: 'Segoe UI, sans-serif', fontSize: '0.88rem' }}>{resumeStatus}</p>}
          <form onSubmit={uploadResume}>
            <div className="field">
              <label>Choose file (.pdf or .txt, max 5MB)</label>
              <input type="file" accept=".pdf,.txt" onChange={(e) => setResumeFile(e.target.files[0])} />
            </div>
            <button className="btn" type="submit" disabled={!resumeFile || uploading}>
              {uploading ? 'Uploading…' : 'Upload resume'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
