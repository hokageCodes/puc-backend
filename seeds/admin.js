import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Admin from '../models/Admin.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI (or MONGO_URI) is not defined.');
  process.exit(1);
}

const ADMIN_EMAIL = 'admin@paulusoro.com';
const ADMIN_PASSWORD = 'Admin123!';

async function seedAdmin() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to:', mongoose.connection.name);
    console.log('📊 Database:', mongoose.connection.db.databaseName);

    console.log('🧹 Clearing existing admins...');
    const deleteResult = await Admin.deleteMany({});
    console.log(`🗑️ Deleted ${deleteResult.deletedCount} existing admin(s)`);

    console.log('👤 Creating admin account...');
    const admin = await Admin.create({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      isAdmin: true,
    });

    console.log('✅ Admin created successfully');
    console.log('   📧 Email:', admin.email);
    console.log('   🆔 ID:', admin._id);

    console.log('📊 Total admins:', await Admin.countDocuments());
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Database connection closed');
  }
}

seedAdmin();