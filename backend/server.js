require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db/db');

const authRoutes = require('./routes/authRoutes');
const driveRoutes = require('./routes/driveRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const studentRoutes = require('./routes/studentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const superadminRoutes = require('./routes/superadminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const fileRoutes = require('./routes/fileRoutes');

// Safety net: a few third-party libraries (tesseract.js's model download,
// occasional pg pool hiccups) can throw outside the normal promise chain.
// Without this handler, one such failure would crash the entire server for
// every logged-in user. With it, the failure is logged and the server
// keeps running.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection (server continues running):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server continues running):', err);
});

const app = express();
app.use(cors());
// Raised from the default ~100kb since some payloads (e.g. bulk PRN lists)
// can be a little larger than the default allows.
app.use(express.json({ limit: '5mb' }));

// Resumes, marksheets, and announcement attachments are all stored as
// database blobs (see routes/fileRoutes.js) — nothing is written to local
// disk, so there's no upload directory to serve here.

// Site logo: a plain static file, not a database setting — drop a file
// named exactly "logo.png" into backend/public/ and it's live immediately
// at GET /branding/logo.png, no re-upload or admin UI needed. Swapping the
// file (or replacing it during a redeploy) is the whole workflow.
const publicDir = path.join(__dirname, 'public');
fs.mkdirSync(publicDir, { recursive: true });
app.use('/branding', express.static(publicDir));

app.use('/api/auth', authRoutes);
app.use('/api/drives', driveRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/files', fileRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
// Wait for the database schema to finish initializing before accepting
// requests — otherwise the first few requests could race the CREATE TABLE
// statements on a cold start.
db.ready.then(() => {
  app.listen(PORT, () => console.log(`Placement Management System API running on port ${PORT}`));
});
