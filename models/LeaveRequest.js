import mongoose from 'mongoose';

const LeaveRequestSchema = new mongoose.Schema({
  staff: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Staff', 
    required: true 
  },
  leaveType: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'LeaveType', 
    required: true 
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  totalDays: { type: Number, required: true },
  reason: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved_teamlead', 'approved_linemanager', 'approved_hr', 'rejected'],
    default: 'pending'
  },
  rejectionReason: { type: String },
  currentApprover: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Staff' 
  },
  approvalHistory: [{
    approver: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Staff',
      required: true
    },
    role: { type: String, required: true },
    action: { 
      type: String, 
      enum: ['approved', 'rejected'],
      required: true
    },
    comment: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  workflowStep: { 
    type: String, 
    enum: ['teamlead', 'linemanager', 'hr'],
    default: 'teamlead'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

LeaveRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('LeaveRequest', LeaveRequestSchema);

