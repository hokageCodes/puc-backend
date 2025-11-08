import express from 'express';
import { getDepartments } from '../controllers/departmentController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth({ scope: 'cms' }));

router.get('/', requireRoles('admin', 'hr', 'cms'), getDepartments);

export default router;
