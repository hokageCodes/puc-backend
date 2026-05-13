import express from 'express';
import {
  createDiaryEntry,
  deleteDiaryEntry,
  getDiaryAvailability,
  getDiaryConflictsPreview,
  getDiaryEntry,
  listDiaryEntries,
  updateDiaryEntry,
} from '../controllers/courtDiaryController.js';
import { ensureLeaveEnrolled, requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';

const router = express.Router();

router.use(requireAuth({ scope: 'leave' }));
router.use(ensureLeaveEnrolled);
router.use(requireRoles('admin', 'hr', 'lineManager', 'teamLead', 'staff'));

router.get('/entries', listDiaryEntries);
router.get('/entries/conflicts-preview', getDiaryConflictsPreview);
router.get('/entries/:id', getDiaryEntry);
router.get('/calendar/availability', getDiaryAvailability);

router.post(
  '/entries',
  validateBody({
    allowlist: [
      'matterTitle',
      'matterRef',
      'court',
      'appearanceDate',
      'appearanceTime',
      'nextHearingDate',
      'notes',
      'status',
      'acknowledgeDuplicate',
      'acknowledgeTeamOverlap',
    ],
    required: ['matterTitle', 'court', 'appearanceDate'],
  }),
  createDiaryEntry
);

router.patch(
  '/entries/:id',
  validateBody({
    allowlist: [
      'matterTitle',
      'matterRef',
      'court',
      'appearanceDate',
      'appearanceTime',
      'nextHearingDate',
      'notes',
      'status',
      'acknowledgeDuplicate',
      'acknowledgeTeamOverlap',
    ],
  }),
  updateDiaryEntry
);

router.delete('/entries/:id', deleteDiaryEntry);

export default router;
