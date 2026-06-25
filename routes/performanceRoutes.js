import express from 'express';
import {
  getMeta,
  createCycle,
  listCycles,
  advanceCycle,
  closeCycle,
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

export default router;
