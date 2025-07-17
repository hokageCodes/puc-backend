// fixPracticeAreas.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Staff from './models/Staff.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function fixPracticeAreas() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const allStaff = await Staff.find();

    let updatedCount = 0;

    for (const staff of allStaff) {
      const fixedPracticeAreas = staff.practiceAreas.map(id =>
        typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
      );

      const hasMismatch = staff.practiceAreas.some((id, idx) =>
        typeof id === 'string' || !id.equals(fixedPracticeAreas[idx])
      );

      if (hasMismatch) {
        staff.practiceAreas = fixedPracticeAreas;
        await staff.save();
        updatedCount++;
      }
    }

    console.log(`🎉 Done! Updated ${updatedCount} staff documents`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error fixing practice areas:', err);
  }
}

fixPracticeAreas();
