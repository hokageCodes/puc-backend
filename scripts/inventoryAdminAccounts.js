/**
 * READ-ONLY inventory for the Hub migration (Phase 0 / Phase 12 prep).
 *
 * Lists every account in the legacy `Admin` collection and flags those that have
 * NO matching `Staff` record (by email). Those flagged accounts must be migrated
 * into `Staff` (with role `admin`) BEFORE the `Admin` model is deleted in Phase 12.
 *
 * This script performs NO writes. Safe to run against production.
 *
 *   cd puc-backend && node scripts/inventoryAdminAccounts.js
 *
 * Requires MONGODB_URI (or MONGO_URI / DATABASE_URL) in the environment / .env.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Admin from '../models/Admin.js';
import Staff from '../models/Staff.js';

const norm = (e) => String(e || '').toLowerCase().trim();

const run = async () => {
  await connectDB();

  const admins = await Admin.find({}, { email: 1, isAdmin: 1, createdAt: 1 }).lean();
  const staff = await Staff.find({}, { email: 1, roles: 1 }).lean();

  const staffByEmail = new Map(staff.map((s) => [norm(s.email), s]));

  const orphans = []; // Admin with no Staff match — MUST migrate
  const matched = []; // Admin already has a Staff record

  for (const a of admins) {
    const match = staffByEmail.get(norm(a.email));
    if (!match) {
      orphans.push(a);
    } else {
      const hasAdminRole = Array.isArray(match.roles) && match.roles.includes('admin');
      matched.push({ email: a.email, staffRoles: match.roles, hasAdminRole });
    }
  }

  console.log('\n=== Admin account inventory ===');
  console.log(`Total Admin docs:        ${admins.length}`);
  console.log(`Total Staff docs:        ${staff.length}`);
  console.log(`Admin WITH Staff match:  ${matched.length}`);
  console.log(`Admin WITHOUT Staff (orphans — MUST migrate): ${orphans.length}`);

  if (orphans.length) {
    console.log('\n--- Orphan admins (no Staff record) ---');
    orphans.forEach((a) => console.log(`  • ${a.email}  (created ${a.createdAt || 'n/a'})`));
  }

  const matchedMissingRole = matched.filter((m) => !m.hasAdminRole);
  if (matchedMissingRole.length) {
    console.log('\n--- Matched admins whose Staff record LACKS the `admin` role (review) ---');
    matchedMissingRole.forEach((m) => console.log(`  • ${m.email}  roles=${JSON.stringify(m.staffRoles)}`));
  }

  console.log('\nDone (read-only — no data was modified).\n');

  await mongoose.connection.close();
};

run().catch(async (err) => {
  console.error('Inventory failed:', err.message);
  try { await mongoose.connection.close(); } catch { /* ignore */ }
  process.exit(1);
});
