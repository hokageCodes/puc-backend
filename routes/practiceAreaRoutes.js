// routes/practiceAreaRoutes.js

import express from 'express';
import {
  getPracticeAreas,
  getPracticeAreaById,
} from '../controllers/practiceAreaController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth({ scope: 'cms' }));

router.get('/', requireRoles('admin', 'hr', 'cms'), getPracticeAreas);
router.get('/:id', requireRoles('admin', 'hr', 'cms'), getPracticeAreaById);

export default router;
