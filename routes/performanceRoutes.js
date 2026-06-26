import express from 'express';
import {
  getMeta,
  createCycle,
  listCycles,
  advanceCycle,
  closeCycle,
  getMyReview,
  updateMyObjectives,
  updateMyGoals,
  submitMyPlan,
  getTeamReviews,
  getReviewById,
  agreePlan,
  saveMyAssessment,
  shareMyStage,
  saveManagerAssessment,
  returnStage,
  setMyFinalRating,
  setManagerFinalRating,
  moderateReview,
  reopenReview,
  exportCycle,
  getMyHistory,
} from '../controllers/performanceController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';

const router = express.Router();

// Performance evaluation is part of the unified hub session. Per-feature
// authorization (employee vs manager vs HR) is enforced per-route with
// requireRoles(...) — same pattern as leave.
router.use(requireAuth({ scope: ['hub'] }));

// Phase 0 — reference metadata (enums, behaviours, rating descriptions).
router.get('/meta', getMeta);

// Phase 1 — cycle administration (HR/admin only).
const CYCLE_FIELDS = ['label', 'planningOpensAt', 'midTermOpensAt', 'halfYearOpensAt', 'moderationOpensAt', 'closesAt'];
router.post('/cycles', requireRoles('hr', 'admin'), validateBody({ allowlist: CYCLE_FIELDS, required: ['label'] }), createCycle);
router.get('/cycles', requireRoles('hr', 'admin'), listCycles);
router.post('/cycles/:id/advance', requireRoles('hr', 'admin'), advanceCycle);
router.post('/cycles/:id/close', requireRoles('hr', 'admin'), closeCycle);

// Phase 2 — employee planning (self-service; any authenticated hub staffer).
router.get('/me', getMyReview);
router.get('/me/history', getMyHistory); // Phase 7 — past reviews
router.put('/me/objectives', validateBody({ allowlist: ['objectives'] }), updateMyObjectives);
router.put('/me/goals', validateBody({ allowlist: ['developmentGoals'] }), updateMyGoals);
router.post('/me/submit-plan', validateBody({ allowlist: [] }), submitMyPlan);

// Phase 4 — employee stage self-assessment (mid|half) + share.
router.put('/me/assessment/:stage', validateBody({ allowlist: ['objectives', 'behaviours'] }), saveMyAssessment);
router.post('/me/share/:stage', validateBody({ allowlist: [] }), shareMyStage);

// Phase 5 — employee proposes their final rating (half-year).
router.post('/me/final-rating', validateBody({ allowlist: ['rating', 'rationale'] }), setMyFinalRating);

// Phase 3 — manager / HR review queue + plan agreement.
const MANAGER_ROLES = ['teamLead', 'lineManager', 'hr', 'admin'];
router.get('/reviews', requireRoles(...MANAGER_ROLES), getTeamReviews);
router.get('/reviews/:id', requireRoles(...MANAGER_ROLES), getReviewById);
router.post('/reviews/:id/agree-plan', requireRoles(...MANAGER_ROLES), validateBody({ allowlist: ['action', 'comment'] }), agreePlan);

// Phase 4 — manager stage assessment (mid|half) + return.
router.put('/reviews/:id/assessment/:stage', requireRoles(...MANAGER_ROLES), validateBody({ allowlist: ['objectives', 'behaviours'] }), saveManagerAssessment);
router.post('/reviews/:id/return/:stage', requireRoles(...MANAGER_ROLES), validateBody({ allowlist: [] }), returnStage);

// Phase 5 — manager records their final rating (half-year).
router.post('/reviews/:id/manager-final', requireRoles(...MANAGER_ROLES), validateBody({ allowlist: ['rating', 'rationale'] }), setManagerFinalRating);

// Phase 6 — HR moderation (rating of record + reopen).
router.post('/reviews/:id/moderate', requireRoles('hr', 'admin'), validateBody({ allowlist: ['rating', 'note'] }), moderateReview);
router.post('/reviews/:id/reopen', requireRoles('hr', 'admin'), validateBody({ allowlist: ['note'] }), reopenReview);

// Phase 7 — cycle CSV export (HR/admin).
router.get('/cycles/:id/export', requireRoles('hr', 'admin'), exportCycle);

export default router;
