import express from 'express';
import { staffLogin, staffLogout, getCurrentStaff } from '../controllers/staffAuthController.js';
import { authenticateStaff } from '../middleware/roleAuth.js';

const router = express.Router();

router.post('/login', staffLogin);
router.post('/logout', authenticateStaff, staffLogout);
router.get('/me', authenticateStaff, getCurrentStaff);

export default router;

