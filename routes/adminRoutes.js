// routes/adminRoutes.js
import express from 'express';
import { login, getMe, logout } from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js'; // renamed for clarity

const router = express.Router();

// Public route
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logout); // Optional: can also allow public logout

export default router;
