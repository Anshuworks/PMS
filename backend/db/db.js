// Postgres connection pool. Set DATABASE_URL in your environment (e.g. in a
// .env file loaded by your process manager, or exported in your shell)
// before starting the server — something like:
//   postgresql://user:password@host:5432/dbname?sslmode=require
// Free options that work well here: Neon (neon.tech), Supabase, Render.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Create a free Postgres database (e.g. at neon.tech) and set DATABASE_URL before starting the server.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most free hosted Postgres providers require SSL but use a
  // certificate chain Node doesn't automatically trust — this is the
  // standard workaround. Safe for this use case (not handling payments).
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error (server continues running):', err.message);
});

async function initSchema() {
  await pool.query(`
    -- ===================== STUDENTS =====================
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,

      name TEXT NOT NULL,
      prn TEXT UNIQUE NOT NULL,
      branch TEXT NOT NULL,
      personal_email TEXT NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,

      college_email TEXT,
      college_name TEXT,
      whatsapp_number TEXT,
      gender TEXT,
      aadhar_no TEXT,
      pan_no TEXT,
      dob TEXT,
      age INTEGER,
      current_year INTEGER,

      tenth_board TEXT,
      tenth_percentage REAL,
      tenth_passing_year INTEGER,

      twelfth_or_diploma_type TEXT,
      twelfth_or_diploma_name TEXT,
      twelfth_or_diploma_percentage REAL,
      twelfth_passing_year INTEGER,

      college_passing_year INTEGER,

      backlogs_active INTEGER,
      backlogs_dead INTEGER,
      year_gap INTEGER,

      sem1_sgpa REAL,
      sem2_sgpa REAL,
      sem3_sgpa REAL,
      sem4_sgpa REAL,
      sem5_sgpa REAL,
      sem6_sgpa REAL,
      sem7_sgpa REAL,

      appearing_for TEXT,
      degree TEXT,
      year_gap_reason TEXT,
      current_address TEXT,
      permanent_address TEXT,
      parent_name TEXT,
      parent_contact_number TEXT,
      parent_email TEXT,

      -- Resume stored as a blob directly in the database (bytea), not on
      -- local disk — survives server restarts/redeploys and works the
      -- same whether you're on one server or several.
      resume_data BYTEA,
      resume_filename TEXT,
      resume_mimetype TEXT,
      resume_text TEXT,

      verified BOOLEAN DEFAULT FALSE,
      verified_by INTEGER,
      verified_at TIMESTAMPTZ,

      profile_locked BOOLEAN DEFAULT FALSE,

      -- Password reset via one-time email OTP (see /auth/forgot-password,
      -- /auth/reset-password). Plain 6-digit code, single-use, short expiry.
      reset_otp TEXT,
      reset_otp_expires TIMESTAMPTZ,

      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ===================== ADMINS =====================
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'coordinator',
      created_by INTEGER,
      reset_otp TEXT,
      reset_otp_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ===================== DRIVES =====================
    CREATE TABLE IF NOT EXISTS drives (
      id SERIAL PRIMARY KEY,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      package TEXT,
      description TEXT,

      min_cgpa REAL DEFAULT 0,
      min_tenth_percentage REAL DEFAULT 0,
      min_twelfth_percentage REAL DEFAULT 0,
      max_backlogs_active INTEGER DEFAULT 999,
      max_backlogs_dead INTEGER DEFAULT 999,
      max_year_gap INTEGER DEFAULT 999,
      allowed_branches TEXT,
      allowed_genders TEXT,
      allowed_passing_years TEXT,

      deadline TIMESTAMPTZ,

      allow_placed_students BOOLEAN DEFAULT FALSE,
      extra_notes TEXT,
      external_link TEXT,
      custom_fields JSONB,

      status TEXT DEFAULT 'open',
      created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ===================== APPLICATIONS =====================
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      drive_id INTEGER NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'Applied',

      -- Application-specific resume override, same blob-in-db approach as
      -- the profile default. NULL means "use the student's profile resume".
      resume_data BYTEA,
      resume_filename TEXT,
      resume_mimetype TEXT,

      custom_responses JSONB,
      external_confirmed BOOLEAN DEFAULT FALSE,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(drive_id, student_id)
    );

    -- ===================== ANNOUNCEMENTS =====================
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      drive_id INTEGER NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      attachment_data BYTEA,
      attachment_filename TEXT,
      attachment_mimetype TEXT,
      created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ===================== NOTIFICATIONS =====================
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      drive_id INTEGER REFERENCES drives(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ===================== SETTINGS =====================
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- ===================== AUDIT LOG =====================
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      actor_admin_id INTEGER,
      actor_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Postgres supports ADD COLUMN IF NOT EXISTS natively (unlike SQLite),
  // so this safely self-heals a database created by an earlier version of
  // this schema (e.g. your existing Neon project from before OTP reset
  // was added) without needing to drop/recreate anything.
  await pool.query(`
    ALTER TABLE students ADD COLUMN IF NOT EXISTS reset_otp TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS reset_otp_expires TIMESTAMPTZ;
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_otp TEXT;
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_otp_expires TIMESTAMPTZ;
  `);
}

// Run schema setup once at startup. server.js awaits this before listening.
const ready = initSchema().catch((err) => {
  console.error('Failed to initialize database schema:', err.message);
  process.exit(1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  ready,
};
