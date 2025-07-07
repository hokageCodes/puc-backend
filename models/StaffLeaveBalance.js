import mongoose from 'mongoose';

const StaffLeaveBalanceSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  allocated: { type: Number, default: 0 },
  used: { type: Number, default: 0 },
});

export default mongoose.model('StaffLeaveBalance', StaffLeaveBalanceSchema);
