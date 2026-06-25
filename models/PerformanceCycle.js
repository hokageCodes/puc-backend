import mongoose from 'mongoose';
import { CYCLE_STAGES } from '../utils/performanceEnums.js';

/**
 * PerformanceCycle — the firm-wide (or per-period) container for one appraisal round.
 * One open cycle at a time is the common case. HR/admin advances it stage by stage
 * (Findings §2 / EXECUTION.md §3.1). Reviews attach to a cycle (PerformanceReview).
 */
const PerformanceCycleSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true }, // e.g. "H1 2026"
    stage: { type: String, enum: CYCLE_STAGES, default: 'planning' },

    // Stage windows — advisory dates so the UI can show "what's open now".
    planningOpensAt: { type: Date },
    midTermOpensAt: { type: Date },
    halfYearOpensAt: { type: Date },
    moderationOpensAt: { type: Date },
    closesAt: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true }
);

PerformanceCycleSchema.index({ label: 1 }, { unique: true });
PerformanceCycleSchema.index({ stage: 1 });

export default mongoose.model('PerformanceCycle', PerformanceCycleSchema);
