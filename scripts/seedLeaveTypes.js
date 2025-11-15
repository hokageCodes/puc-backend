import 'dotenv/config';
import mongoose from 'mongoose';
import LeaveType from '../models/LeaveType.js';

const DEFAULT_TYPES = [
  {
    name: 'Annual Leave',
    code: 'ANNUAL',
    description: 'Paid vacation days for personal rest and travel.',
    defaultAnnualAllocation: 20,
    maxContinuousDays: 15,
    requiresApproval: true,
  },
  {
    name: 'Sick Leave',
    code: 'SICK',
    description: 'Time off for illness or medical appointments.',
    defaultAnnualAllocation: 5,
    maxContinuousDays: 7,
    requiresApproval: true,
    needsDocument: true,
  },
  {
    name: 'Compassionate Leave',
    code: 'COMPASSIONATE',
    description: 'Emergency leave for bereavement or critical family matters.',
    defaultAnnualAllocation: 5,
    requiresApproval: true,
  },
  {
    name: 'Maternity Leave',
    code: 'MATERNITY',
    description: 'Extended leave for childbirth and care.',
    defaultAnnualAllocation: 90,
    requiresApproval: true,
    needsDocument: true,
    visibility: { roles: ['hr', 'staff'] },
  },
  {
    name: 'Paternity Leave',
    code: 'PATERNITY',
    description: 'Short-term leave for fathers after childbirth.',
    defaultAnnualAllocation: 10,
    requiresApproval: true,
    needsDocument: true,
  },
];

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ Missing MONGODB_URI.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  for (const type of DEFAULT_TYPES) {
    await LeaveType.findOneAndUpdate(
      { code: type.code },
      { $set: type },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`🔁 Seeded leave type: ${type.code}`);
  }

  await mongoose.disconnect();
  console.log('✅ Leave types seeded, connection closed.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
