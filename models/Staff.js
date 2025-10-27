import mongoose from 'mongoose';
import StaffLeaveBalance from './StaffLeaveBalance.js';
import LeaveType from './LeaveType.js';

const StaffSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    phoneNumber: { type: String, required: true },
    profilePhoto: { type: String, default: '' },
  
    bio: { type: String },
    position: { type: String },
  
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  
    practiceAreas: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PracticeArea'
      }
    ],
  
    // Leave Management Fields
    isOnProbation: { type: Boolean, default: true },
    employeeId: { type: String, unique: true },
    azureId: { type: String },
    hireDate: { type: Date },
    confirmationDate: { type: Date },
  
    // Role & Reporting Fields
    isTeamLead: { type: Boolean, default: false },
    isLineManager: { type: Boolean, default: false },
    teamLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    lineManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  
    // Authentication
    password: { type: String, select: false },
  
    createdAt: { type: Date, default: Date.now },
  });
  

export default mongoose.model('Staff', StaffSchema);
