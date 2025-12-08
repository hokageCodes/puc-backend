import 'dotenv/config';
import mongoose from 'mongoose';
import LeaveBalance from '../models/LeaveBalance.js';

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ Missing MONGODB_URI.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  try {
    // Find all leave balances
    const balances = await LeaveBalance.find({}).lean();
    console.log(`📊 Found ${balances.length} leave balance records`);

    let fixed = 0;
    let deleted = 0;

    for (const balance of balances) {
      // Check if period is null or undefined
      if (!balance.period && balance.year) {
        // Update legacy records with year field to use period
        await LeaveBalance.updateOne(
          { _id: balance._id },
          { $set: { period: balance.year }, $unset: { year: 1 } }
        );
        fixed++;
        console.log(`✅ Fixed balance ${balance._id}: set period to ${balance.year}`);
      } else if (!balance.period && !balance.year) {
        // Delete records with no period or year (invalid records)
        await LeaveBalance.deleteOne({ _id: balance._id });
        deleted++;
        console.log(`🗑️  Deleted invalid balance ${balance._id}: no period or year`);
      } else if (balance.period && balance.year) {
        // Remove duplicate year field if both exist
        await LeaveBalance.updateOne(
          { _id: balance._id },
          { $unset: { year: 1 } }
        );
        fixed++;
        console.log(`✅ Removed duplicate year field from balance ${balance._id}`);
      }
    }

    console.log(`\n✅ Fix complete:`);
    console.log(`   - Fixed: ${fixed} records`);
    console.log(`   - Deleted: ${deleted} invalid records`);

    // Drop old index if it exists and create new one
    try {
      const collection = mongoose.connection.db.collection('leavebalances');
      const indexes = await collection.indexes();
      
      // Check if old year index exists
      const yearIndex = indexes.find(idx => 
        idx.name === 'staff_1_leaveType_1_year_1' || 
        (idx.key && idx.key.year)
      );
      
      if (yearIndex) {
        console.log('\n🔄 Dropping old index with year field...');
        await collection.dropIndex(yearIndex.name);
        console.log('✅ Old index dropped');
      }
      
      // Ensure the correct index exists
      console.log('🔄 Ensuring correct index exists...');
      await LeaveBalance.collection.createIndex(
        { staff: 1, leaveType: 1, period: 1 },
        { unique: true, name: 'staff_1_leaveType_1_period_1' }
      );
      console.log('✅ Index created/verified');
    } catch (indexError) {
      console.warn('⚠️  Index operation warning:', indexError.message);
    }

  } catch (error) {
    console.error('❌ Fix failed:', error);
    throw error;
  }

  await mongoose.disconnect();
  console.log('🔌 Connection closed.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});

