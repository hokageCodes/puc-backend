import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Staff from '../models/Staff.js';
import Counter from '../models/Counter.js';

dotenv.config();

const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoURI) {
  console.error('❌ MONGODB_URI (or MONGO_URI) is not defined.');
  process.exit(1);
}

try {
  await mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('🛢️ Connected to MongoDB');

  const result = await Staff.deleteMany({});
  console.log(`🧹 Removed ${result.deletedCount} staff documents`);

  await Counter.findByIdAndUpdate({ _id: 'staffCode' }, { $set: { seq: 0 } }, { upsert: true });
  console.log('🔁 Reset staffCode counter');

  await mongoose.disconnect();
  console.log('✅ Staff collection cleared and connection closed');
  process.exit(0);
} catch (error) {
  console.error('❌ Failed to clear staff collection:', error);
  process.exit(1);
}


