/**
 * Performance Evaluation — controlled vocabularies (single source of truth).
 *
 * Transcribed verbatim from the firm's live `Performance Evaluation Form.xlsx`
 * (see PERFORMANCE-REVIEW-FINDINGS.md §3–§4). The backend validates against these,
 * and the frontend fetches them via `GET /api/performance/meta` so it never
 * hard-codes the values. Nothing here is admin-editable: the behaviours are the
 * firm's fixed values and the rating scale is contractual.
 */

// §4 — Objective weighting (discrete %). Stored as numbers; weights must sum to 100.
export const OBJECTIVE_WEIGHTINGS = [10, 15, 20, 25, 30, 35, 40, 45, 50];

// §4 — Objective status vocabulary differs by stage.
export const OBJECTIVE_STATUS_MID = ['Ahead of Plan', 'On Plan', 'Behind Plan', 'Not Started'];
export const OBJECTIVE_STATUS_HALF = ['Exceeded', 'Achieved', 'Partially Achieved', 'Did Not Achieve', 'Did Not Start'];

// §4 — Behaviour rating scale.
export const BEHAVIOUR_RATINGS = [
  'Demonstrates most if not all of the time',
  'Sometimes Demonstrates',
  'Rarely or Never Demonstrates',
];

// §4 — Final 1–5 rating.
export const FINAL_RATINGS = ['5-Exceptional', '4-Notable', '3-Good', '2-Improvement Needed', '1-Unacceptable'];

// Cycle stages and the per-review workflow state machine.
export const CYCLE_STAGES = ['planning', 'mid_term', 'half_year', 'moderation', 'closed'];
export const REVIEW_STATUSES = [
  'draft',
  'plan_submitted',
  'plan_agreed',
  'mid_employee',
  'mid_manager_returned',
  'half_employee',
  'half_manager_returned',
  'moderation',
  'closed',
  'reopened',
];

// Who authored an assessment entry, and which stage it belongs to.
export const ENTRY_AUTHORS = ['employee', 'manager'];
export const ASSESSMENT_STAGES = ['mid', 'half'];

// §3.3 — the 5 fixed firm-value behaviours (seeded into every review, not editable).
export const BEHAVIOURS = [
  { key: 'teamwork', name: 'Teamwork', statement: "I harness each person's unique ability to deliver the best results" },
  { key: 'integrity', name: 'Integrity', statement: 'I create and promote an environment that supports trust, encourages discipline and accountability' },
  { key: 'mastery', name: 'Mastery', statement: 'My skills and expertise are reflected in the way I think, deliver and present myself' },
  { key: 'excellence', name: 'Excellence', statement: 'I provide quality services to clients and positively influence justice administration.' },
  { key: 'entrepreneurial', name: 'Entrepreneurial', statement: 'I attract and retain quality clients, and support the operations of a sustainable practice' },
];

export const BEHAVIOUR_KEYS = BEHAVIOURS.map((b) => b.key);

// §4 — Final rating scale definitions (reference; shown next to the rating picker).
export const RATING_DESCRIPTIONS = [
  { rating: 5, label: 'Exceptional', description: 'Consistently achieved and surpassed all goals, exceeded proficiency; consistently demonstrated all firm-values behaviours.' },
  { rating: 4, label: 'Notable', description: 'Surpassed a substantial number of goals, exceeded proficiency in some areas; consistently demonstrated all behaviours.' },
  { rating: 3, label: 'Good', description: 'Met all targets and proficiency; consistently demonstrated most behaviours, others occasionally.' },
  { rating: 2, label: 'Improvement Needed', description: 'Met some goals/proficiency, others partial; demonstrated some behaviours, others rarely/never.' },
  { rating: 1, label: 'Unacceptable', description: 'Fell short of standards, most goals unmet, proficiency not met; rarely/never demonstrated behaviours.' },
];

// §4 — Character limits (enforced client + server).
export const CHAR_LIMITS = Object.freeze({
  OBJECTIVE_COMMENT: 750,
  BEHAVIOUR_COMMENT: 740,
  FINAL_RATIONALE: 3500,
});

// Structural limits (§3.2 / §3.4).
export const LIMITS = Object.freeze({
  MAX_OBJECTIVES: 6,
  MIN_DEVELOPMENT_GOALS: 2,
  TOTAL_WEIGHTING: 100,
});

/**
 * The full payload served by GET /api/performance/meta — everything the frontend
 * needs to render dropdowns and reference text without hard-coding any values.
 */
export const buildPerformanceMeta = () => ({
  objectiveWeightings: OBJECTIVE_WEIGHTINGS,
  objectiveStatus: { mid: OBJECTIVE_STATUS_MID, half: OBJECTIVE_STATUS_HALF },
  behaviourRatings: BEHAVIOUR_RATINGS,
  finalRatings: FINAL_RATINGS,
  behaviours: BEHAVIOURS,
  ratingDescriptions: RATING_DESCRIPTIONS,
  charLimits: CHAR_LIMITS,
  limits: LIMITS,
  cycleStages: CYCLE_STAGES,
});
