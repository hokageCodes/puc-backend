import express from 'express';
import { createDepartment, getDepartments, createTeam, getTeams } from '../controllers/metaController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';

const router = express.Router();

router.use(requireAuth({ scope: 'cms' }));

router.post('/departments', requireRoles('admin', 'hr'), validateBody({ allowlist: ['name'], required: ['name'] }), createDepartment);
router.get('/departments', requireRoles('admin', 'hr', 'cms'), getDepartments);
router.post('/teams', requireRoles('admin', 'hr'), validateBody({ allowlist: ['name', 'department'], required: ['name', 'department'] }), createTeam);
router.get('/teams', requireRoles('admin', 'hr', 'cms'), getTeams);

export default router;
