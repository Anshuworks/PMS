import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const emptyContact = { role_label: '', name: '', phone: '', email: '' };

export default function HelpPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [contacts, setContacts] = useState([]);
  const [draft, setDraft] = useState([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { contacts } = await api.getHelpContacts();
      setContacts(contacts);
      setDraft(contacts);
    } catch (err) {
      setError(err.message);
    }
  }

  function updateDraft(i, field, value) {
    setDraft((d) => d.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  function addRow() {
    setDraft((d) => [...d, { ...emptyContact }]);
  }

  function removeRow(i) {
    setDraft((d) => d.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const cleaned = draft.filter((c) => c.name?.trim());
      await api.updateHelpContacts(cleaned);
      setContacts(cleaned);
      setDraft(cleaned);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="shell">
        <div className="drive-head">
          <h1>Help &amp; contacts</h1>
          {isAdmin && !editing && <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit contacts</button>}
        </div>
        <p className="muted">Reach out to the placement team for anything not covered by the portal itself.</p>

        {error && <div className="error-banner">{error}</div>}

        {!editing ? (
          contacts.length === 0 ? (
            <div className="card"><p className="muted">No contacts have been added yet.</p></div>
          ) : (
            contacts.map((c, i) => (
              <div className="card" key={i}>
                <p className="muted" style={{ margin: 0 }}>{c.role_label}</p>
                <h3 style={{ margin: '4px 0' }}>{c.name}</h3>
                {c.phone && <p style={{ margin: '2px 0' }}>📞 {c.phone}</p>}
                {c.email && <p style={{ margin: '2px 0' }}>✉️ {c.email}</p>}
              </div>
            ))
          )
        ) : (
          <div className="card">
            {draft.map((c, i) => (
              <div className="row" key={i} style={{ alignItems: 'end', marginBottom: 10 }}>
                <div className="field"><label>Role (e.g. TNP Admin)</label><input value={c.role_label} onChange={(e) => updateDraft(i, 'role_label', e.target.value)} /></div>
                <div className="field"><label>Name</label><input value={c.name} onChange={(e) => updateDraft(i, 'name', e.target.value)} /></div>
                <div className="field"><label>Phone</label><input value={c.phone} onChange={(e) => updateDraft(i, 'phone', e.target.value)} /></div>
                <div className="field"><label>Email</label><input value={c.email} onChange={(e) => updateDraft(i, 'email', e.target.value)} /></div>
                <button type="button" className="btn btn-danger" onClick={() => removeRow(i)}>Remove</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={addRow}>+ Add contact</button>
              <button type="button" className="btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setDraft(contacts); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
