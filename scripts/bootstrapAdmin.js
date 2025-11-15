import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Staff from '../models/Staff.js';

const run = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/puc';

    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const email = 'admin@paulusoro.com';
    const password = 'Admin123!';

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await Staff.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        $set: {
          firstName: 'PUC',
          lastName: 'Admin',
          email: email.toLowerCase(),
          passwordHash,
          roles: ['admin', 'cms'],
          division: 'admin',
          leaveEnabled: true,
          isVisible: false,
          staffCode: 'PUC000',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log('✅ Admin staff ready:', admin.email);
    console.log('🔐 Temporary password:', password);
  } catch (error) {
    console.error('❌ Failed to bootstrap admin:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();