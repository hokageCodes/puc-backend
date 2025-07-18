// routes/adminRoutes.js
import express from 'express';
import { login, getMe, logout } from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public login
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

export default router;
