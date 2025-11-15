import 'dotenv/config';
import mongoose from 'mongoose';
import LeaveType from '../models/LeaveType.js';
import LeaveBalance from '../models/LeaveBalance.js';
import Staff from '../models/Staff.js';

const currentPeriod = new Date().getUTCFullYear();

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ Missing MONGODB_URI.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  const staffList = await Staff.find({}).select('_id').lean();
  const leaveTypes = await LeaveType.find({ isActive: true }).lean();

  console.log(`👥 Staff count: ${staffList.length}`);
  console.log(`🏷️ Leave types: ${leaveTypes.length}`);

  let created = 0;
  for (const staff of staffList) {
    for (const type of leaveTypes) {
      const balance = await LeaveBalance.findOneAndUpdate(
        { staff: staff._id, leaveType: type._id, period: currentPeriod },
        {
          $setOnInsert: {
            allocated:
              typeof type.defaultDays === 'number'
                ? type.defaultDays
                : type.defaultAnnualAllocation ?? 0,
            carriedOver: 0,
            used: 0,
            pending: 0,
          },
        },
        { upsert: true, new: false, setDefaultsOnInsert: true }
      );

      if (!balance) {
        created += 1;
      }
    }
  }

  console.log(`✅ Seed complete. Created ${created} new balance records for period ${currentPeriod}.`);
  await mongoose.disconnect();
  console.log('🔌 Connection closed.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Balance seed failed:', err);
  process.exit(1);
});
