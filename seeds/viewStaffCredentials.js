import connectDB from '../config/db.js';
import Staff from '../models/Staff.js';

export const viewStaffCredentials = async () => {
  try {
    await connectDB();
    
    console.log('👥 Staff Login Credentials\n');
    console.log('=' .repeat(70));
    
    const allStaff = await Staff.find().populate('department', 'name').select('-password');
    const currentYear = new Date().getFullYear();
    
    if (allStaff.length === 0) {
      console.log('❌ No staff found in database');
      console.log('💡 Run: node seeds/seedStaff.js to create staff');
      process.exit(0);
    }
    
    console.log(`\n📝 Default Password Format: PUC{FirstName}${currentYear}\n`);
    console.log('='.repeat(70));
    
    allStaff.forEach((staff, index) => {
      const defaultPassword = `PUC${staff.firstName}${currentYear}`;
      const isProbation = staff.isOnProbation ? ' (Probation)' : ' (Confirmed)';
      const roles = [];
      if (staff.isTeamLead) roles.push('Team Lead');
      if (staff.isLineManager) roles.push('Line Manager');
      
      console.log(`\n${index + 1}. ${staff.firstName} ${staff.lastName}`);
      console.log(`   📧 Email: ${staff.email}`);
      console.log(`   🔑 Password: ${defaultPassword}`);
      if (roles.length > 0) {
        console.log(`   👤 Role: ${roles.join(', ')}`);
      }
      console.log(`   🏢 Status: ${isProbation}`);
      console.log(`   🏛️  Department: ${staff.department?.name || 'N/A'}`);
      console.log('   ─'.repeat(35));
    });
    
    console.log(`\n✅ Total: ${allStaff.length} staff members\n`);
    console.log('💡 Staff should login at: /leave/login');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  viewStaffCredentials();
}

export default viewStaffCredentials;

