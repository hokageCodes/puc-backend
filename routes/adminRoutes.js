// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const { login, getMe, logout } = require('../controllers/adminController');
const { protect } = require('../middleware/auth');

router.post('/login', login);
router.post('/logout', logout); // ✅ add this
router.get('/me', protect, getMe);


// routes/adminRoutes.js
router.post('/logout', (req, res) => {
    res.clearCookie('admin_token', {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ message: 'Logged out' });
  });
  
module.exports = router;
