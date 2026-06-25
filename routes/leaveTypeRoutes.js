import express from 'express';
import {
  adminListLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
} from '../controllers/leaveTypeController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';

const router = express.Router();

// Leave-type management is HR/admin only. Accepts the unified hub session.
router.use(requireAuth({ scope: ['hub', 'leave', 'cms'] }));
router.use(requireRoles('admin', 'hr'));

const allowlist = [
  'name', 'code', 'description', 'color', 'defaultDays', 'applicableGender',
  'isGenderSpecific', 'isPaid', 'requiresDocument', 'isActive', 'minimumNotice', 'maxConsecutiveDays',
];

router.get('/', adminListLeaveTypes);
router.post('/', validateBody({ allowlist, required: ['name'] }), createLeaveType);
router.put('/:id', validateBody({ allowlist }), updateLeaveType);
router.delete('/:id', deleteLeaveType);

export default router;
