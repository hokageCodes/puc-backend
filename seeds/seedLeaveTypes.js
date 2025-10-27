import connectDB from '../config/db.js';
import LeaveType from '../models/LeaveType.js';

const leaveTypes = [
  {
    name: 'Sick Leave',
    description: 'For medical appointments and illness',
    defaultDays: 10,
    requiresDocument: false,
    isActive: true
  },
  {
    name: 'Annual Leave',
    description: 'Regular vacation time',
    defaultDays: 20,
    requiresDocument: false,
    isActive: true
  },
  {
    name: 'Maternity Leave',
    description: 'Maternity leave for expectant mothers',
    defaultDays: 90,
    requiresDocument: true,
    isActive: true
  },
  {
    name: 'Paternity Leave',
    description: 'Paternity leave for new fathers',
    defaultDays: 10,
    requiresDocument: false,
    isActive: true
  },
  {
    name: 'Exam Leave',
    description: 'Leave for professional examinations',
    defaultDays: 5,
    requiresDocument: true,
    isActive: true
  },
  {
    name: 'Casual Leave',
    description: 'Casual leave for personal matters',
    defaultDays: 7,
    requiresDocument: false,
    isActive: true
  }
];

export const seedLeaveTypes = async () => {
  try {
    await connectDB();
    
    console.log('🌱 Seeding leave types...');
    
    // Clear existing leave types
    await LeaveType.deleteMany({});
    
    // Insert new leave types
    await LeaveType.insertMany(leaveTypes);
    
    console.log('✅ Leave types seeded successfully!');
    
    // Display seeded data
    const seeded = await LeaveType.find();
    console.log('\n📋 Leave Types:');
    seeded.forEach((lt, index) => {
      console.log(`${index + 1}. ${lt.name} - ${lt.defaultDays} days`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding leave types:', error);
    process.exit(1);
  }
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedLeaveTypes();
}

export default seedLeaveTypes;

