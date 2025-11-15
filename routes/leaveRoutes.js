import express from 'express';
import {
  listLeaveTypes,
  getMyBalances,
  createLeaveRequest,
  getMyRequests,
  getPendingApprovals,
  approveLeaveRequest,
  rejectLeaveRequest,
} from '../controllers/leaveController.js';
import { requireAuth, ensureLeaveEnrolled, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth({ scope: 'leave' }));
router.use(ensureLeaveEnrolled);

router.get('/types', listLeaveTypes);
router.get('/balances', getMyBalances);

router.post('/requests', createLeaveRequest);
router.get('/requests', getMyRequests);

router.get('/approvals', getPendingApprovals);
router.post('/requests/:id/approve', requireRoles('teamLead', 'lineManager', 'hr'), approveLeaveRequest);
router.post('/requests/:id/reject', requireRoles('teamLead', 'lineManager', 'hr'), rejectLeaveRequest);

export default router;
