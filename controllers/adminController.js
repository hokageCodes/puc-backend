// controllers/adminController.js
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

const getAccessSecret = () => {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT access secret is not configured');
  }
  return secret;
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const tokenPayload = {
      sub: admin._id,
      id: admin._id, // Legacy support
      email: admin.email,
      isAdmin: admin.isAdmin,
      scope: 'cms',
      roles: ['admin', 'cms'],
      tokenVersion: 0,
    };

    const token = jwt.sign(tokenPayload, getAccessSecret(), { expiresIn: '24h' });

    // Enhanced cookie configuration for production
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      path: '/',
    };

    // Set the cookie
    res.cookie('admin_token', token, cookieOptions);

    // Prepare response data
    const responseData = {
      message: 'Login successful',
      admin: {
        id: admin._id,
        email: admin.email,
        isAdmin: admin.isAdmin,
      },
    };

    // Send response
    res.json(responseData);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMe = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const adminProfile = {
    id: req.user.id,
    email: req.user.email,
    roles: req.user.roles || [],
    division: req.user.division,
    staffCode: req.user.staffCode,
    leaveEnabled: req.user.leaveEnabled,
  };

  if (!adminProfile.roles.includes('admin') && !adminProfile.roles.includes('cms')) {
    return res.status(403).json({ message: 'Not authorized for CMS' });
  }

  res.json({ admin: adminProfile });
};

export const logout = (req, res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/'
  };

  res.clearCookie('admin_token', cookieOptions);
  
  res.json({ message: 'Logged out successfully' });
};