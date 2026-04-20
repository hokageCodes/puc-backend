import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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
import { validateBody } from '../middleware/validation.js';

const router = express.Router();

const normalizedEmailFromRequest = (req) => String(req.body?.email || '').toLowerCase().trim();
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => `${ipKeyGenerator(req, res)}:${normalizedEmailFromRequest(req) || 'unknown'}`,
  message: { message: 'Too many login attempts. Please try again later.' },
});
const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => `${ipKeyGenerator(req, res)}:${normalizedEmailFromRequest(req) || 'unknown'}`,
  message: { message: 'Too many reset requests. Please try again later.' },
});

router.post('/login', loginLimiter, validateBody({ allowlist: ['email', 'password', 'scope'], required: ['email', 'password'] }), login);
router.post('/refresh', validateBody({ allowlist: ['scope', 'refreshToken'] }), refresh);
router.post('/logout', validateBody({ allowlist: ['scope', 'refreshToken'] }), logout);

router.post('/invite', requireAuth({ scope: 'cms' }), requireRoles('admin', 'hr'), validateBody({ allowlist: ['email'], required: ['email'] }), sendInvite);
router.post('/request-reset', resetRequestLimiter, validateBody({ allowlist: ['email'], required: ['email'] }), requestPasswordReset);
router.post('/reset', validateBody({ allowlist: ['token', 'password'], required: ['token', 'password'] }), resetPassword);
router.post('/activate', validateBody({ allowlist: ['token', 'password'], required: ['token', 'password'] }), activateAccount);

export default router;
