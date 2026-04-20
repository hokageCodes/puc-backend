import mongoose from 'mongoose';

const STAFF_DIVISIONS = ['legal', 'admin', 'other'];
const AUTH_PROVIDERS = ['local'];

const StaffSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phoneNumber: { type: String },

    profilePhoto: { type: String, default: '' },
    bio: { type: String },
    position: { type: String },

    employeeId: { type: String, unique: true, sparse: true },
    staffCode: { type: String },

    division: { type: String, enum: STAFF_DIVISIONS, default: 'legal' },
    roles: { type: [String], default: ['staff'] },
    leaveEnabled: { type: Boolean, default: true },

    hireDate: { type: Date },
    confirmationDate: { type: Date },

    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    practiceAreas: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PracticeArea',
      },
    ],

    teamLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    lineManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    hrId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },

    isVisible: { type: Boolean, default: true },

    passwordHash: { type: String },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    passwordSetAt: { type: Date },
    lastInviteSentAt: { type: Date },

    lastLoginAt: { type: Date },
    lastLoginProvider: { type: String, enum: AUTH_PROVIDERS, default: 'local' },
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastFailedLoginAt: { type: Date },
    refreshTokens: [
      {
        scope: { type: String, enum: ['leave', 'cms'], required: true },
        tokenHash: { type: String, required: true },
        issuedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
        revokedAt: { type: Date },
        revocationReason: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

StaffSchema.index({ staffCode: 1 }, { unique: true, sparse: true });
StaffSchema.index({ roles: 1 });

StaffSchema.methods.hasRole = function hasRole(role) {
  if (!Array.isArray(this.roles)) return false;
  return this.roles.includes(role);
};

StaffSchema.set('toJSON', {
  transform(_, ret) {
    delete ret.passwordHash;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    delete ret.tokenVersion;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    delete ret.lastFailedLoginAt;
    delete ret.refreshTokens;
    return ret;
  },
});

export default mongoose.model('Staff', StaffSchema);
