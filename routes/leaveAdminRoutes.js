import express from 'express';
import { adminGetStaffBalances, adminSetStaffBalance } from '../controllers/leaveController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';

const router = express.Router();

// HR/admin leave administration. No ensureLeaveEnrolled — the actor is managing
// other staff, not requesting their own leave.
router.use(requireAuth({ scope: ['hub', 'leave', 'cms'] }));
router.use(requireRoles('admin', 'hr'));

router.get('/staff/:staffId/balances', adminGetStaffBalances);
router.put(
  '/staff/:staffId/balances/:leaveTypeId',
  validateBody({ allowlist: ['allocated', 'carriedOver', 'used', 'reason', 'usedFrom', 'usedTo'] }),
  adminSetStaffBalance
);

export default router;
