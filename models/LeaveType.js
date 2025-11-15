import mongoose from 'mongoose';

const LeaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String },
    description: { type: String },
    defaultDays: { type: Number, default: 0 },
    requiresDocument: { type: Boolean, default: false },
    isPaid: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isGenderSpecific: { type: Boolean, default: false },
    applicableGender: {
      type: String,
      enum: ['male', 'female', 'all'],
      default: 'all',
    },
    minimumNotice: { type: Number, default: 0 },
    maxConsecutiveDays: { type: Number },
    // Legacy/backward compatibility fields
    code: { type: String, trim: true, uppercase: true },
    defaultAnnualAllocation: { type: Number },
    needsDocument: { type: Boolean },
    carryOverPolicy: {
      maxDays: { type: Number },
      expiresAfterMonths: { type: Number },
    },
    visibility: {
      roles: [{ type: String }],
      divisions: [{ type: String }],
    },
  },
  {
    timestamps: true,
  }
);

LeaveTypeSchema.index({ name: 1 }, { unique: true });
LeaveTypeSchema.index({ isActive: 1 });

export default mongoose.model('LeaveType', LeaveTypeSchema);

