import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatIST, istLocalInputToUtcIso, utcIsoToISTLocalInput } from '../dateUtils';

const emptyForm = {
  company: '', role: '', package: '', description: '',
  min_cgpa: 0, min_tenth_percentage: 0, min_twelfth_percentage: 0,
  max_backlogs_active: 999, max_backlogs_dead: 999, max_year_gap: 999,
  allowed_branches: '', allowed_genders: '', allowed_passing_years: '',
  deadline: '', allow_placed_students: false, extra_notes: '', external_link: '',
};

const emptyCustomField = { label: '', type: 'text', optionsText: '' };

function StatusTag({ status }) {
  const cls = status === 'open' ? 'eligible' : status === 'expired' ? 'expired' : 'closed';
  return <span className={`tag ${cls}`}>{status}</span>;
}

export default function AdminDashboard() {
  const [drives, setDrives] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [customFields, setCustomFields] = useState([]);
  const [error, setError] = useState('');
  const [editingDeadlineFor, setEditingDeadlineFor] = useState(null);
  const [deadlineDraft, setDeadlineDraft] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setDrives(await api.getDrives());
    } catch (err) {
      setError(err.message);
    }
  }

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        allowed_branches: form.allowed_branches ? form.allowed_branches.split(',').map((s) => s.trim()) : [],
        allowed_genders: form.allowed_genders ? form.allowed_genders.split(',').map((s) => s.trim()) : [],
        allowed_passing_years: form.allowed_passing_years ? form.allowed_passing_years.split(',').map((s) => s.trim()) : [],
        deadline: istLocalInputToUtcIso(form.deadline),
        custom_fields: customFields
          .filter((f) => f.label.trim())
          .map((f) => ({
            label: f.label.trim(),
            type: f.type,
            options: f.type === 'select' ? f.optionsText.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
          })),
      };
      await api.createDrive(payload);
      setForm(emptyForm);
      setCustomFields([]);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function addCustomField() {
    setCustomFields((f) => [...f, { ...emptyCustomField }]);
  }
  function updateCustomField(i, key, value) {
    setCustomFields((f) => f.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));
  }
  function removeCustomField(i) {
    setCustomFields((f) => f.filter((_, idx) => idx !== i));
  }

  async function closeDrive(id) {
    await api.closeDrive(id);
    load();
  }

  async function reopenDrive(id) {
    await api.reopenDrive(id);
    load();
  }

  async function deleteDrive(id, company) {
    if (!window.confirm(`Permanently delete the ${company} drive? This also deletes its applications and announcements. This cannot be undone.`)) return;
    try {
      await api.deleteDrive(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditDeadline(drive) {
    setEditingDeadlineFor(drive.id);
    setDeadlineDraft(utcIsoToISTLocalInput(drive.deadline));
  }

  async function saveDeadline(id) {
    try {
      await api.updateDriveDeadline(id, istLocalInputToUtcIso(deadlineDraft));
      setEditingDeadlineFor(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="shell">
        <div className="drive-head">
          <h1>Placement drives</h1>
          <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New drive'}</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {showForm && (
          <div className="card">
            <h3>Create drive</h3>
            <form onSubmit={submit}>
              <div className="row">
                <div className="field"><label>Company</label><input required value={form.company} onChange={(e) => update('company', e.target.value)} /></div>
                <div className="field"><label>Role</label><input required value={form.role} onChange={(e) => update('role', e.target.value)} /></div>
                <div className="field"><label>Package</label><input value={form.package} onChange={(e) => update('package', e.target.value)} placeholder="e.g. 10 LPA" /></div>
              </div>
              <div className="field">
                <label>Description (shown on the drive's detail page)</label>
                <textarea rows="3" value={form.description} onChange={(e) => update('description', e.target.value)} />
              </div>
              <div className="row">
                <div className="field">
                  <label>Extra notes (drive-specific requirements)</label>
                  <input value={form.extra_notes} onChange={(e) => update('extra_notes', e.target.value)} placeholder="e.g. Bring 2 printed resumes and an ID card" />
                </div>
                <div className="field">
                  <label>External link (optional)</label>
                  <input value={form.external_link} onChange={(e) => update('external_link', e.target.value)} placeholder="https://company.com/careers/apply" />
                </div>
              </div>

              <h3 style={{ fontSize: '1rem', marginTop: 20 }}>Drive-specific questions (optional)</h3>
              <p className="muted" style={{ marginTop: -6 }}>
                Add any question this company needs that isn't already part of a student's profile —
                shown to students in the apply preview, and required before they can submit.
              </p>
              {customFields.map((f, i) => (
                <div key={i} className="row" style={{ alignItems: 'end' }}>
                  <div className="field"><label>Question</label><input value={f.label} onChange={(e) => updateCustomField(i, 'label', e.target.value)} placeholder="e.g. GitHub profile link" /></div>
                  <div className="field" style={{ maxWidth: 160 }}>
                    <label>Answer type</label>
                    <select value={f.type} onChange={(e) => updateCustomField(i, 'type', e.target.value)}>
                      <option value="text">Free text</option>
                      <option value="select">Choose one</option>
                    </select>
                  </div>
                  {f.type === 'select' && (
                    <div className="field"><label>Options (comma separated)</label><input value={f.optionsText} onChange={(e) => updateCustomField(i, 'optionsText', e.target.value)} placeholder="Pune, Bangalore, Remote" /></div>
                  )}
                  <button type="button" className="btn btn-danger" onClick={() => removeCustomField(i)}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={addCustomField} style={{ marginBottom: 16 }}>+ Add question</button>

              <h3 style={{ fontSize: '1rem', marginTop: 20 }}>Eligibility rules</h3>
              <div className="row">
                <div className="field"><label>Minimum CGPA</label><input type="number" step="0.01" value={form.min_cgpa} onChange={(e) => update('min_cgpa', parseFloat(e.target.value))} /></div>
                <div className="field"><label>Minimum 10th %</label><input type="number" step="0.01" value={form.min_tenth_percentage} onChange={(e) => update('min_tenth_percentage', parseFloat(e.target.value))} /></div>
                <div className="field"><label>Minimum 12th/Diploma %</label><input type="number" step="0.01" value={form.min_twelfth_percentage} onChange={(e) => update('min_twelfth_percentage', parseFloat(e.target.value))} /></div>
                <div className="field"><label>Max active backlogs</label><input type="number" value={form.max_backlogs_active} onChange={(e) => update('max_backlogs_active', parseInt(e.target.value))} /></div>
                <div className="field"><label>Max dead backlogs</label><input type="number" value={form.max_backlogs_dead} onChange={(e) => update('max_backlogs_dead', parseInt(e.target.value))} /></div>
                <div className="field"><label>Max year gap</label><input type="number" value={form.max_year_gap} onChange={(e) => update('max_year_gap', parseInt(e.target.value))} /></div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Allowed branches (comma separated, blank = all)</label>
                  <input value={form.allowed_branches} onChange={(e) => update('allowed_branches', e.target.value)} placeholder="CSE, IT" />
                </div>
                <div className="field">
                  <label>Allowed genders (comma separated, blank = all)</label>
                  <input value={form.allowed_genders} onChange={(e) => update('allowed_genders', e.target.value)} placeholder="Female" />
                </div>
                <div className="field">
                  <label>Allowed passing years (comma separated, blank = all)</label>
                  <input value={form.allowed_passing_years} onChange={(e) => update('allowed_passing_years', e.target.value)} placeholder="2026, 2027" />
                </div>
              </div>
              <div className="row" style={{ alignItems: 'center' }}>
                <div className="field" style={{ maxWidth: 280 }}>
                  <label>Application deadline (IST)</label>
                  <input type="datetime-local" value={form.deadline} onChange={(e) => update('deadline', e.target.value)} />
                </div>
                <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 320 }}>
                  <input type="checkbox" checked={form.allow_placed_students} onChange={(e) => update('allow_placed_students', e.target.checked)} style={{ width: 'auto' }} />
                  <span>Allow already-placed students to apply</span>
                </label>
              </div>

              <button className="btn" type="submit">Publish drive</button>
            </form>
          </div>
        )}

        {drives.map((d) => (
          <div className="card" key={d.id}>
            <div className="drive-head">
              <div>
                <h3 style={{ marginBottom: 2 }}>{d.company} — {d.role}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Min CGPA {d.min_cgpa} · Branches: {d.allowed_branches || 'All'} · {d.package || 'Package n/a'}
                  {d.allow_placed_students ? ' · Open to placed students' : ''}
                </p>
                {editingDeadlineFor === d.id ? (
                  <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
                    <input type="datetime-local" value={deadlineDraft} onChange={(e) => setDeadlineDraft(e.target.value)} style={{ maxWidth: 220 }} />
                    <button className="btn" type="button" onClick={() => saveDeadline(d.id)}>Save</button>
                    <button className="btn btn-ghost" type="button" onClick={() => setEditingDeadlineFor(null)}>Cancel</button>
                  </div>
                ) : (
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    {d.deadline ? `Deadline: ${formatIST(d.deadline)} IST` : 'No deadline set'}{' '}
                    <a href="#" onClick={(e) => { e.preventDefault(); startEditDeadline(d); }}>(edit)</a>
                  </p>
                )}
              </div>
              <StatusTag status={d.computedStatus} />
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="btn btn-ghost" to={`/admin/drives/${d.id}`}>View applicants</Link>
              <Link className="btn btn-ghost" to={`/admin/drives/${d.id}/announcements`}>Announcements</Link>
              {d.computedStatus === 'open' ? (
                <button className="btn btn-ghost" onClick={() => closeDrive(d.id)}>Close drive</button>
              ) : (
                <button className="btn btn-ghost" onClick={() => reopenDrive(d.id)}>Reopen drive</button>
              )}
              <button className="btn btn-danger" onClick={() => deleteDrive(d.id, d.company)}>Delete drive</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
