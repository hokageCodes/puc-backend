import mongoose from 'mongoose';

const StaffLeaveBalanceSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  year: { type: Number, required: true, default: new Date().getFullYear() },
  allocated: { type: Number, default: 0 },
  used: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Virtual field for remaining balance
StaffLeaveBalanceSchema.virtual('remaining').get(function() {
  return this.allocated - this.used;
});

StaffLeaveBalanceSchema.set('toJSON', { virtuals: true });
StaffLeaveBalanceSchema.set('toObject', { virtuals: true });

export default mongoose.model('StaffLeaveBalance', StaffLeaveBalanceSchema);
