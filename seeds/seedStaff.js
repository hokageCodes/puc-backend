import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Staff from '../models/Staff.js';
import PracticeArea from '../models/PracticeArea.js';
import Department from '../models/Department.js';
import Team from '../models/Team.js';
import bcrypt from 'bcryptjs';

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

console.log('🛢️ Connected to DB...');

// Fetch references
const practiceAreas = await PracticeArea.find({});
const departments = await Department.find({}).populate('teams');

// Helper: random from array
const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Clear existing staff
await Staff.deleteMany({});

// Create 20 staff members
const staffData = [];

for (let i = 1; i <= 20; i++) {
  const firstName = `User${i}`;
  const lastName = `Test${i}`;
  const email = `user${i}@firm.com`;
  const phoneNumber = `080100000${i.toString().padStart(2, '0')}`;
  const bio = `This is ${firstName} ${lastName}'s bio.`;
  const position = ['Associate', 'Partner', 'Senior Partner', 'Junior Associate', 'Comms Officer'][i % 5];

  const department = randomFrom(departments);
  const team = department.teams.length ? randomFrom(department.teams) : null;

  const selectedPracticeAreas = [];
  const howMany = Math.floor(Math.random() * 2) + 1;
  for (let j = 0; j < howMany; j++) {
    selectedPracticeAreas.push(randomFrom(practiceAreas)._id);
  }

  staffData.push({
    firstName,
    lastName,
    email,
    phoneNumber,
    profilePic: '',
    bio,
    position,
    department: department._id,
    team: team ? team._id : null,
    practiceAreas: selectedPracticeAreas,
    isTeamLead: i % 7 === 0,
    isLineManager: i % 5 === 0
  });
}

// Create in DB and set default passwords
const currentYear = new Date().getFullYear();
console.log('🔐 Setting up default passwords...');

const createdStaff = await Staff.insertMany(staffData);
console.log(`✅ Seeded ${createdStaff.length} staff members`);

// Set default passwords
for (const staff of createdStaff) {
  const defaultPassword = `PUC${staff.firstName}${currentYear}`;
  const salt = await bcrypt.genSalt(10);
  staff.password = await bcrypt.hash(defaultPassword, salt);
  await staff.save();
  console.log(`   ${staff.firstName} ${staff.lastName}: ${defaultPassword}`);
}

console.log(`\n📝 Default password format: PUC{FirstName}{Year}`);
console.log(`📧 Staff can login with their email and default password`);

await mongoose.disconnect();
