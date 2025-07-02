// seeds/admin.js - Debug Version
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

// Using PUC database
const MONGODB_URI = 'mongodb+srv://pucit:orochimaru1@mfonbooks.krds7.mongodb.net/PUC';

const connectDB = async () => {
  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB Connected to:', mongoose.connection.name);
    console.log('📊 Database name:', mongoose.connection.db.databaseName);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const seedAdmin = async () => {
  try {
    console.log('📋 Admin Schema fields:', Object.keys(Admin.schema.paths));
    
    console.log('🔍 Checking existing admins...');
    const existingAdmins = await Admin.find({});
    console.log('📊 Found', existingAdmins.length, 'existing admin(s)');
    
    if (existingAdmins.length > 0) {
      console.log('📄 Existing admins:', existingAdmins.map(a => ({ email: a.email, id: a._id })));
    }

    // Delete existing admin if any
    const deleteResult = await Admin.deleteMany({});
    console.log(`🗑️ Deleted ${deleteResult.deletedCount} existing admin(s)`);

    // Test basic document creation first
    console.log('👤 Creating new admin...');
    console.log('📝 Data to create:', {
      email: 'admin@firm.com',
      password: 'admin123',
      isAdmin: true
    });

    // Create new admin step by step
    const adminData = {
      email: 'admin@firm.com',
      password: 'admin123',
      isAdmin: true
    };

    console.log('🔧 Creating admin with Admin.create()...');
    const admin = await Admin.create(adminData);
    console.log('✅ Admin.create() completed');

    if (admin) {
      console.log('✅ Admin created successfully!');
      console.log('📧 Email:', admin.email);
      console.log('🆔 ID:', admin._id);
      console.log('👑 isAdmin:', admin.isAdmin);
      console.log('🔐 Password hash length:', admin.password ? admin.password.length : 'No password');
      console.log('🔐 Password starts with $2a:', admin.password ? admin.password.startsWith('$2a') : false);
    } else {
      console.log('❌ Admin creation returned null/undefined');
    }

    // Verify it was actually saved
    console.log('🔍 Verifying admin was saved...');
    const savedAdmin = await Admin.findOne({ email: 'admin@firm.com' });
    if (savedAdmin) {
      console.log('✅ Admin found in database after creation');
      console.log('📊 Total admins in collection:', await Admin.countDocuments());
    } else {
      console.log('❌ Admin NOT found in database after creation');
    }
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    console.error('📍 Error stack:', error.stack);
    if (error.code === 11000) {
      console.log('💡 Duplicate key error - admin might already exist');
    }
    if (error.name === 'ValidationError') {
      console.log('💡 Validation Error Details:', error.errors);
    }
  }
};

const runSeed = async () => {
  await connectDB();
  await seedAdmin();
  
  // Final count check
  console.log('📊 Final admin count:', await Admin.countDocuments());
  
  mongoose.connection.close();
  console.log('🔌 Database connection closed');
  process.exit(0);
};

runSeed();