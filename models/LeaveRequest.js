import mongoose from 'mongoose';

const AttachmentSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS file ID
    filename: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ApproverStepSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['teamLead', 'lineManager', 'hr'],
      required: true,
    },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'skipped'],
      default: 'pending',
    },
    actedAt: { type: Date },
    comment: { type: String },
  },
  { _id: true }
);

const TimelineEventSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: ['submitted', 'approved', 'rejected', 'cancelled', 'adjusted'],
      required: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: true }
);

const LeaveRequestSchema = new mongoose.Schema(
  {
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    durationDays: { type: Number, required: true },
    halfDay: { type: String, enum: ['first', 'second'] },
    coveragePlan: { type: String, enum: ['handover', 'delegated', 'pending', ''] },
    handoverNotes: { type: String, maxlength: 2000 },
    reason: { type: String, required: true, maxlength: 1000 },
    attachments: [AttachmentSchema],
    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'pending_teamlead',
        'pending_linemanager',
        'pending_hr',
        'approved',
        'rejected',
        'cancelled',
      ],
      default: 'submitted',
    },
    // Optional leave allowance request captured at submission: whether the staffer
    // wants the allowance paid out, and which month they'd like it paid in (e.g. "2026-07").
    leaveAllowance: { type: Boolean, default: false },
    allowanceMonth: { type: String, maxlength: 20 },
    approverChain: [ApproverStepSchema],
    timeline: [TimelineEventSchema],
    // Set when a staffer requests to withdraw an already-approved request (awaiting
    // a manager/HR to confirm). Pending requests are cancelled outright, not flagged.
    withdrawalRequestedAt: { type: Date },
    withdrawalReason: { type: String, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  },
  {
    timestamps: true,
  }
);

LeaveRequestSchema.index({ staff: 1, status: 1, startDate: -1 });
LeaveRequestSchema.index({ 'approverChain.assignee': 1, status: 1 });

export default mongoose.model('LeaveRequest', LeaveRequestSchema);

