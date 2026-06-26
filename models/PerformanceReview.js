import mongoose from 'mongoose';
import {
  OBJECTIVE_WEIGHTINGS,
  OBJECTIVE_STATUS_MID,
  OBJECTIVE_STATUS_HALF,
  BEHAVIOUR_RATINGS,
  BEHAVIOUR_KEYS,
  FINAL_RATINGS,
  REVIEW_STATUSES,
  ENTRY_AUTHORS,
  ASSESSMENT_STAGES,
  CHAR_LIMITS,
} from '../utils/performanceEnums.js';

/**
 * PerformanceReview — one appraisal record per (staff × cycle). Mirrors the firm's
 * Excel form: header snapshot + objectives + the 5 fixed behaviours + development
 * goals + the employee/manager final ratings + HR-moderated rating of record.
 * See PERFORMANCE-REVIEW-BUILD.md §B. Children are embedded ("one form = one doc").
 */

// Objective status spans both vocabularies (mid + half); the controller validates
// the right set per stage. Kept permissive at the schema level so a mid-stage value
// isn't rejected as an enum miss against the half-stage list.
const OBJECTIVE_STATUS_ALL = [...new Set([...OBJECTIVE_STATUS_MID, ...OBJECTIVE_STATUS_HALF])];

const ObjectiveEntrySchema = new mongoose.Schema(
  {
    stage: { type: String, enum: ASSESSMENT_STAGES, required: true }, // mid | half
    author: { type: String, enum: ENTRY_AUTHORS, required: true }, // employee | manager
    status: { type: String, enum: OBJECTIVE_STATUS_ALL },
    comments: { type: String, maxlength: CHAR_LIMITS.OBJECTIVE_COMMENT },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ObjectiveSchema = new mongoose.Schema(
  {
    performanceArea: { type: String, trim: true },
    weighting: { type: Number, enum: OBJECTIVE_WEIGHTINGS },
    target: { type: String },
    entries: [ObjectiveEntrySchema], // up to 4: {employee,manager} × {mid,half}
  },
  { _id: true }
);

const BehaviourEntrySchema = new mongoose.Schema(
  {
    stage: { type: String, enum: ASSESSMENT_STAGES, required: true },
    author: { type: String, enum: ENTRY_AUTHORS, required: true },
    rating: { type: String, enum: BEHAVIOUR_RATINGS },
    comments: { type: String, maxlength: CHAR_LIMITS.BEHAVIOUR_COMMENT },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const BehaviourAssessmentSchema = new mongoose.Schema(
  {
    key: { type: String, enum: BEHAVIOUR_KEYS, required: true },
    statement: { type: String, required: true }, // seeded verbatim from the firm values
    entries: [BehaviourEntrySchema],
  },
  { _id: false }
);

const SignOffSchema = new mongoose.Schema(
  { name: { type: String }, date: { type: Date } },
  { _id: false }
);

const DevelopmentGoalSchema = new mongoose.Schema(
  {
    competency: { type: String }, // what skills/knowledge to develop
    howAchieved: { type: String },
    evidence: { type: String }, // how you know it's done
    dueDate: { type: Date },
    status: { type: String },
    employeeSignOff: SignOffSchema,
    leadSignOff: SignOffSchema,
  },
  { _id: true }
);

const TimelineEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true }, // e.g. plan_submitted, plan_agreed, mid_shared...
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: true }
);

// D6 visibility gates — the other side's columns stay hidden until shared/returned.
const SharedFlagsSchema = new mongoose.Schema(
  {
    planShared: { type: Boolean, default: false },
    midShared: { type: Boolean, default: false },
    midReturned: { type: Boolean, default: false },
    halfShared: { type: Boolean, default: false },
    halfReturned: { type: Boolean, default: false },
  },
  { _id: false }
);

const PerformanceReviewSchema = new mongoose.Schema(
  {
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PerformanceCycle', required: true },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },

    // Header snapshot (D3: grade is per-review, not on Staff).
    grade: { type: String },
    departmentSnapshot: { type: String },
    lineManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    teamLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },

    status: { type: String, enum: REVIEW_STATUSES, default: 'draft' },
    sharedFlags: { type: SharedFlagsSchema, default: () => ({}) },

    objectives: [ObjectiveSchema], // ≤ 6 (enforced in controller)
    behaviours: [BehaviourAssessmentSchema], // exactly 5, seeded on creation
    developmentGoals: [DevelopmentGoalSchema], // ≥ 2 (enforced on submit)

    // Roll-up (Final Rating tab).
    employeeFinalRating: { type: String, enum: FINAL_RATINGS },
    employeeFinalRationale: { type: String, maxlength: CHAR_LIMITS.FINAL_RATIONALE },
    managerFinalRating: { type: String, enum: FINAL_RATINGS },
    managerFinalRationale: { type: String, maxlength: CHAR_LIMITS.FINAL_RATIONALE },
    moderatedFinalRating: { type: String, enum: FINAL_RATINGS }, // HR rating of record (D5)
    moderationNote: { type: String },
    suggestedScore: { type: Number }, // from utils/performanceScore.js (guidance, D1)

    timeline: [TimelineEventSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true }
);

// One review per person per cycle.
PerformanceReviewSchema.index({ cycle: 1, staff: 1 }, { unique: true });
// Manager queues (Findings §5): "reviews waiting on me".
PerformanceReviewSchema.index({ lineManager: 1, status: 1 });
PerformanceReviewSchema.index({ teamLead: 1, status: 1 });

export default mongoose.model('PerformanceReview', PerformanceReviewSchema);
