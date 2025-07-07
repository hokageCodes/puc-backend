import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import PracticeArea from '../models/PracticeArea.js';
import Department from '../models/Department.js';
import Team from '../models/Team.js';
import LeaveType from '../models/LeaveType.js';

const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
  console.error('❌ MONGO_URI not defined in .env');
  process.exit(1);
}

try {
  await mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('🛢️ Connected to DB...');

  await seedPracticeAreas();
  await seedDepartmentsAndTeams();
  await seedLeaveTypes();

  console.log('\n✅ Seeding complete!');
} catch (err) {
  console.error('❌ Seed failed:', err);
} finally {
  mongoose.disconnect();
}

// =============================
// Seed Practice Areas
// =============================
async function seedPracticeAreas() {
  const practiceAreas = [
    'ADR',
    'Banking & Finance',
    'Communications',
    'Corporate Restructuring / Mergers Acquisition',
    'Labour and Industrial Relations',
    'Project Finance',
    'Transport Law',
    'Maritime',
    'Aviation',
    'General Commerce Practice',
    'Capital Market',
    'Energy & Environment',
  ];

  await PracticeArea.deleteMany({});
  await PracticeArea.insertMany(practiceAreas.map(name => ({ name })));

  console.log('✅ Practice Areas seeded');
}

// =============================
// Seed Departments + Teams
// =============================
async function seedDepartmentsAndTeams() {
  await Team.deleteMany({});
  await Department.deleteMany({});

  const departments = [
    {
      name: 'Litigation Department',
      teams: ['ECT/CARI', 'FACT'],
    },
    {
      name: 'Transactions Department',
      teams: [], // no explicit teams
    },
    {
      name: 'Admin Department',
      teams: [
        'HR',
        'Business Center',
        'Facility Mgmt',
        'Information Technology',
        'Brand & Comms',
        'Finance Team',
      ],
    },
  ];

  for (const dept of departments) {
    const createdDept = await Department.create({ name: dept.name });

    const createdTeams = await Promise.all(
      dept.teams.map(teamName =>
        Team.create({ name: teamName, department: createdDept._id })
      )
    );

    createdDept.teams = createdTeams.map(t => t._id);
    await createdDept.save();
  }

  console.log('✅ Departments and Teams seeded');
}

// =============================
// Seed Leave Types
// =============================
async function seedLeaveTypes() {
  const leaveTypes = [
    { name: 'Annual Leave', defaultDays: 22 },
    { name: 'Sick Leave', defaultDays: 5 },
    { name: 'Compassionate Leave', defaultDays: 2 },
    { name: 'Study Leave', defaultDays: 15 },
  ];

  await LeaveType.deleteMany({});
  await LeaveType.insertMany(leaveTypes);

  console.log('✅ Leave Types seeded');
}
