import connectDB from '../config/db.js';
import Staff from '../models/Staff.js';
import bcrypt from 'bcryptjs';

export const setStaffPasswords = async () => {
  try {
    await connectDB();
    
    console.log('🔐 Setting up default staff passwords...');
    
    // Get all staff
    const allStaff = await Staff.find();
    
    if (allStaff.length === 0) {
      console.log('❌ No staff found in database');
      process.exit(0);
    }
    
    const currentYear = new Date().getFullYear();
    let updatedCount = 0;
    
    // Set default password for each staff
    for (const staff of allStaff) {
      // Skip if already has a password
      if (staff.password) {
        console.log(`⏭️  ${staff.firstName} ${staff.lastName} already has a password`);
        continue;
      }
      
      // Generate default password: PUCfirstnameyear
      const defaultPassword = `PUC${staff.firstName}${currentYear}`;
      
      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultPassword, salt);
      
      // Update staff with password
      staff.password = hashedPassword;
      await staff.save();
      
      console.log(`✅ ${staff.firstName} ${staff.lastName} - Password set: ${defaultPassword}`);
      updatedCount++;
    }
    
    console.log(`\n✅ Successfully set passwords for ${updatedCount} staff members`);
    console.log(`📝 Default password format: PUC{FirstName}{Year}`);
    console.log(`📧 Staff should login with their email and the default password`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting staff passwords:', error);
    process.exit(1);
  }
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setStaffPasswords();
}

export default setStaffPasswords;

