// seeds/createAdmin.js - Create a new admin user
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pucit:orochimaru1@mfonbooks.krds7.mongodb.net/PUC';

const connectDB = async () => {
  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const createAdmin = async () => {
  try {
    // New admin credentials
    const adminEmail = 'admin@paulusoro.com';
    const adminPassword = 'Admin123!';

    console.log('🗑️  Deleting existing admin if any...');
    const deleteResult = await Admin.deleteMany({ email: adminEmail });
    console.log(`   Deleted ${deleteResult.deletedCount} existing admin(s)`);

    console.log('👤 Creating new admin user...');
    
    const admin = await Admin.create({
      email: adminEmail,
      password: adminPassword,
      isAdmin: true
    });

    console.log('✅ Admin created successfully!');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 ADMIN CREDENTIALS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    ' + adminEmail);
    console.log('🔐 Password: ' + adminPassword);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🆔 Admin ID:', admin._id);
    console.log('👑 isAdmin:', admin.isAdmin);
    
  } catch (error) {
    console.error('❌ Failed to create admin:', error);
    if (error.code === 11000) {
      console.log('💡 This email already exists in the database');
    }
  }
};

const runSeed = async () => {
  await connectDB();
  await createAdmin();
  
  mongoose.connection.close();
  console.log('🔌 Database connection closed');
  process.exit(0);
};

runSeed();
