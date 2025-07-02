const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: 6
  },
  isAdmin: { 
    type: Boolean, 
    default: true 
  },
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Hash password before saving
adminSchema.pre('save', async function (next) {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    console.log('📍 Password not modified, skipping hash');
    return next();
  }
  
  console.log('🔐 Hashing password...');
  try {
    // Hash password with cost of 12
    this.password = await bcrypt.hash(this.password, 12);
    console.log('✅ Password hashed successfully');
    next();
  } catch (error) {
    console.error('❌ Password hashing failed:', error);
    next(error);
  }
});

// Compare entered password with hashed one
adminSchema.methods.comparePassword = function (enteredPassword) {
  console.log('🔍 Comparing password...');
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);