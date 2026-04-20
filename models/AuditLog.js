import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema(
  {
    event: { type: String, required: true, immutable: true },
    actorId: { type: String, immutable: true },
    actorEmail: { type: String, immutable: true },
    scope: { type: String, immutable: true },
    ip: { type: String, immutable: true },
    userAgent: { type: String, immutable: true },
    requestId: { type: String, immutable: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
    outcome: { type: String, enum: ['success', 'failure'], default: 'success', immutable: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

AuditLogSchema.index({ event: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ requestId: 1 });

const preventMutation = function preventMutation(next) {
  next(new Error('Audit logs are immutable and cannot be modified'));
};

AuditLogSchema.pre('updateOne', preventMutation);
AuditLogSchema.pre('updateMany', preventMutation);
AuditLogSchema.pre('findOneAndUpdate', preventMutation);
AuditLogSchema.pre('findByIdAndUpdate', preventMutation);
AuditLogSchema.pre('replaceOne', preventMutation);
AuditLogSchema.pre('deleteOne', preventMutation);
AuditLogSchema.pre('deleteMany', preventMutation);
AuditLogSchema.pre('findOneAndDelete', preventMutation);
AuditLogSchema.pre('findByIdAndDelete', preventMutation);

export default mongoose.model('AuditLog', AuditLogSchema);
