const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Simulate admin login (replace with real DB/user logic)
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === 'admin@firm.com' && password === 'admin123') {
    const token = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    });

    res
      .cookie('admin_token', token, {
        httpOnly: true,
        sameSite: 'Lax', // or 'None' if cross-origin with HTTPS
        secure: false,   // set to true if using HTTPS
      })
      .json({ message: 'Login successful' });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// GET /api/admin — Check auth status
router.get('/', (req, res) => {
  const token = req.cookies.admin_token;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.status(200).json({ message: 'Authenticated', admin: decoded });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
