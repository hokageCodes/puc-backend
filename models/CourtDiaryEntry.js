import mongoose from 'mongoose';

const COURT_DIARY_STATUSES = ['scheduled', 'held', 'adjourned', 'closed'];

const CourtDiaryEntrySchema = new mongoose.Schema(
  {
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    matterTitle: { type: String, required: true, trim: true, maxlength: 300 },
    matterRef: { type: String, trim: true, maxlength: 120 },
    court: { type: String, required: true, trim: true, maxlength: 200 },
    appearanceDate: { type: Date, required: true },
    appearanceTime: { type: String, trim: true, maxlength: 40 },
    nextHearingDate: { type: Date },
    notes: { type: String, trim: true, maxlength: 3000 },
    status: { type: String, enum: COURT_DIARY_STATUSES, default: 'scheduled' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true }
);

CourtDiaryEntrySchema.index({ team: 1, appearanceDate: 1 });
CourtDiaryEntrySchema.index({ team: 1, matterRef: 1 });
CourtDiaryEntrySchema.index({ team: 1, status: 1, appearanceDate: 1 });
CourtDiaryEntrySchema.index({ department: 1, appearanceDate: 1 });
CourtDiaryEntrySchema.index({ department: 1, status: 1, appearanceDate: 1 });

export default mongoose.model('CourtDiaryEntry', CourtDiaryEntrySchema);
