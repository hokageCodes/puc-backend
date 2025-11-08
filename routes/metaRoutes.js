import express from 'express';
import { createDepartment, getDepartments, createTeam, getTeams } from '../controllers/metaController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth({ scope: 'cms' }));

router.post('/departments', requireRoles('admin', 'hr'), createDepartment);
router.get('/departments', requireRoles('admin', 'hr', 'cms'), getDepartments);
router.post('/teams', requireRoles('admin', 'hr'), createTeam);
router.get('/teams', requireRoles('admin', 'hr', 'cms'), getTeams);

export default router;
