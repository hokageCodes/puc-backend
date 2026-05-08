/**
 * Assign a Team to a Staff document (fixes "Diary access requires team assignment").
 *
 * Usage:
 *   node scripts/assignStaffTeam.js staff@example.com
 *   node scripts/assignStaffTeam.js staff@example.com <teamObjectId>
 *   node scripts/assignStaffTeam.js staff@example.com ECT
 *
 * With no team argument, uses the first Team document (sorted by name).
 * Ensure MONGODB_URI (or MONGO_URI) is set in .env (same as the API).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('Missing MONGODB_URI or MONGO_URI in environment.');
  process.exit(1);
}

const emailArg = process.argv[2];
const teamArg = process.argv[3];

if (!emailArg) {
  console.error('Usage: node scripts/assignStaffTeam.js <staff-email> [teamId | team-name-fragment]');
  process.exit(1);
}

const email = String(emailArg).toLowerCase().trim();

await mongoose.connect(uri);

const Staff = (await import('../models/Staff.js')).default;
const Team = (await import('../models/Team.js')).default;

const staff = await Staff.findOne({ email });
if (!staff) {
  console.error(`No staff found with email: ${email}`);
  await mongoose.disconnect();
  process.exit(1);
}

let teamId;
if (teamArg) {
  const trimmed = String(teamArg).trim();
  if (mongoose.Types.ObjectId.isValid(trimmed)) {
    teamId = new mongoose.Types.ObjectId(trimmed);
    const exists = await Team.findById(teamId).lean();
    if (!exists) {
      console.error(`No team with id: ${trimmed}`);
      await mongoose.disconnect();
      process.exit(1);
    }
  } else {
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const teams = await Team.find({ name: new RegExp(escaped, 'i') }).sort({ name: 1 }).lean();
    if (teams.length === 0) {
      console.error(`No team matching name fragment: ${trimmed}`);
      console.error('Available teams:');
      const all = await Team.find({}).sort({ name: 1 }).select('name').lean();
      all.forEach((t) => console.error(`  ${t._id.toString()}  ${t.name}`));
      await mongoose.disconnect();
      process.exit(1);
    }
    if (teams.length > 1) {
      console.error(`Multiple teams match "${trimmed}". Pick one id:`);
      teams.forEach((t) => console.error(`  ${t._id.toString()}  ${t.name}`));
      await mongoose.disconnect();
      process.exit(1);
    }
    teamId = teams[0]._id;
  }
} else {
  const first = await Team.findOne().sort({ name: 1 }).lean();
  if (!first) {
    console.error('No teams in database. Run: node seeds/seed.js (or create a Team in CMS).');
    await mongoose.disconnect();
    process.exit(1);
  }
  teamId = first._id;
  console.log(`No team argument — using first team alphabetically: "${first.name}" (${first._id.toString()})`);
}

await Staff.findByIdAndUpdate(staff._id, { $set: { team: teamId } });
const teamDoc = await Team.findById(teamId).select('name').lean();
console.log(`Updated ${email} → team: ${teamDoc?.name || teamId.toString()} (${teamId.toString()})`);
console.log('Sign out and sign in again so the diary UI picks up the team name.');

await mongoose.disconnect();
