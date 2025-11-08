import express from 'express';
import {
  login,
  refresh,
  logout,
  sendInvite,
  requestPasswordReset,
  resetPassword,
  activateAccount,
} from '../controllers/authController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);

router.post('/invite', requireAuth({ scope: 'cms' }), requireRoles('admin', 'hr'), sendInvite);
router.post('/request-reset', requestPasswordReset);
router.post('/reset', resetPassword);
router.post('/activate', activateAccount);

export default router;
