import mongoose from 'mongoose';

const AdjustmentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    reason: { type: String, trim: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const LeaveBalanceSchema = new mongoose.Schema(
  {
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    period: { type: Number, required: true }, // e.g. 2025
    allocated: { type: Number, default: 0 },
    carriedOver: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    adjustments: [AdjustmentSchema],
    lastReconciledAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

LeaveBalanceSchema.index({ staff: 1, leaveType: 1, period: 1 }, { unique: true });

export default mongoose.model('LeaveBalance', LeaveBalanceSchema);

