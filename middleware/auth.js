// middleware/auth.js
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

export const protect = async (req, res, next) => {
  // Prefer cookie token, but support Authorization header fallback for SPA fetches
  let token = req.cookies.admin_token;

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  console.log('Auth middleware check:', {
    hasToken: !!token,
    cookies: Object.keys(req.cookies),
    allCookies: req.cookies,
    path: req.path
  });

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get the admin from database to ensure they still exist and are still admin
    const admin = await Admin.findById(decoded.id).select('-password');
    
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }

    if (!admin.isAdmin) {
      return res.status(401).json({ message: 'Not authorized as admin' });
    }

    req.user = {
      id: admin._id,
      email: admin.email,
      isAdmin: admin.isAdmin
    };
    
    console.log('JWT verification successful for user:', req.user.email);
    next();
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    
    // Clear invalid cookie
    res.clearCookie('admin_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      path: '/'
    });
    
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};