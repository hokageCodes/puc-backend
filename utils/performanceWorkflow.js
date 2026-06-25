/**
 * Performance workflow — cycle stage progression + the per-review state machine.
 *
 * Pure functions (no DB) so they're unit-testable in isolation. The controller
 * calls these to guard transitions; illegal moves are rejected server-side.
 * See PERFORMANCE-REVIEW-BUILD.md §B/§D.
 */
import { CYCLE_STAGES, BEHAVIOURS } from './performanceEnums.js';

// Cycle stages advance strictly in this order; 'closed' is terminal.
export const CYCLE_STAGE_ORDER = [...CYCLE_STAGES]; // planning → mid_term → half_year → moderation → closed

export const nextCycleStage = (stage) => {
  const i = CYCLE_STAGE_ORDER.indexOf(stage);
  if (i < 0 || i >= CYCLE_STAGE_ORDER.length - 1) return null; // unknown or terminal
  return CYCLE_STAGE_ORDER[i + 1];
};

// Per-review forward flow. A manager reviewing the plan can bounce it back to draft
// ("request changes"); everything else moves forward. HR reopen is handled separately.
export const REVIEW_STATUS_TRANSITIONS = Object.freeze({
  draft: ['plan_submitted'],
  plan_submitted: ['plan_agreed', 'draft'], // agree, or request changes
  plan_agreed: ['mid_employee'],
  mid_employee: ['mid_manager_returned'],
  mid_manager_returned: ['half_employee'],
  half_employee: ['half_manager_returned'],
  half_manager_returned: ['moderation'],
  moderation: ['closed'],
  closed: [],
  reopened: ['plan_submitted', 'mid_employee', 'half_employee', 'moderation'],
});

export const canTransitionReview = (from, to) =>
  Boolean(REVIEW_STATUS_TRANSITIONS[from]?.includes(to));

// Ordinal of a review status in the forward flow — used to compute cycle progress
// ("agreed or later"). 'reopened' is treated as pre-agreement.
const FORWARD_ORDER = [
  'draft', 'plan_submitted', 'plan_agreed', 'mid_employee',
  'mid_manager_returned', 'half_employee', 'half_manager_returned', 'moderation', 'closed',
];
export const reviewStatusRank = (status) => {
  const i = FORWARD_ORDER.indexOf(status);
  return i < 0 ? 0 : i;
};
// Statuses that count as "plan agreed or beyond".
export const AGREED_OR_LATER = FORWARD_ORDER.slice(FORWARD_ORDER.indexOf('plan_agreed'));

/**
 * Seed the 5 fixed firm behaviours into a fresh review (empty entries).
 * Statements are copied verbatim so a review stays self-contained even if the
 * canonical list ever changes.
 */
export const seedBehaviours = () =>
  BEHAVIOURS.map((b) => ({ key: b.key, statement: b.statement, entries: [] }));
