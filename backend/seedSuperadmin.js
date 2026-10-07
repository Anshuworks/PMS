/**
 * Run this ONCE to create the first superadmin account, since there's no
 * public registration endpoint to bootstrap from.
 *
 * Usage:
 *   node seedSuperadmin.js "Jane Doe" jane@college.edu somePassword123
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db/db');

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
  console.error('Usage: node seedSuperadmin.js "Full Name" email@college.edu password');
  process.exit(1);
}

async function main() {
  await db.ready; // wait for schema init to finish
  try {
    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await db.query(
      `INSERT INTO admins (name, email, password_hash, role) VALUES ($1, $2, $3, 'superadmin') RETURNING id`,
      [name, email, password_hash]
    );
    console.log(`Superadmin created: ${email} (id ${rows[0].id}). You can now log in on the TNP Admin tab with this email.`);
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      console.error('An admin with this email already exists.');
    } else {
      console.error('Failed:', err.message);
    }
    process.exit(1);
  }
  await db.pool.end();
}

main();
