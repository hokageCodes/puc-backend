/**
 * One-off: set courtDiaryScope to `team` for Litigation (and `department` for others missing the field).
 * Run: node scripts/setLitigationCourtDiaryScope.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('Set MONGODB_URI or MONGO_URI');
  process.exit(1);
}

await mongoose.connect(uri);
const Department = (await import('../models/Department.js')).default;

const litigation = await Department.updateMany(
  { name: /litigation/i },
  { $set: { courtDiaryScope: 'team' } }
);
console.log('Litigation departments updated:', litigation.modifiedCount);

const others = await Department.updateMany(
  { courtDiaryScope: { $exists: false } },
  { $set: { courtDiaryScope: 'department' } }
);
console.log('Other departments defaulted:', others.modifiedCount);

await mongoose.disconnect();
