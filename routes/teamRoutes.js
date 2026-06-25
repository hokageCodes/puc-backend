import express from 'express';
import { getTeams } from '../controllers/teamController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth({ scope: ['hub', 'cms'] }));

router.get('/', requireRoles('admin', 'hr', 'cms'), getTeams);

export default router;
