import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === 'admin@firm.com' && password === 'admin123') {
    const token = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    });

    res
      .cookie('admin_token', token, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
      })
      .json({ message: 'Login successful' });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

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

export default router;
