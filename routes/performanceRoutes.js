import express from 'express';
import { getMeta } from '../controllers/performanceController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Performance evaluation is part of the unified hub session. Per-feature
// authorization (employee vs manager vs HR) is enforced per-route with
// requireRoles(...) as later phases add write endpoints — same pattern as leave.
router.use(requireAuth({ scope: ['hub'] }));

// Phase 0 — reference metadata (enums, behaviours, rating descriptions).
router.get('/meta', getMeta);

export default router;
