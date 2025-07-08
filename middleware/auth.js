import jwt from 'jsonwebtoken';

export const protect = (req, res, next) => {
  const token = req.cookies.admin_token;

  console.log('Auth middleware check:', {
    hasToken: !!token,
    cookies: Object.keys(req.cookies),
    path: req.path
  });

  if (!token) {
    return res.status(401).json({ message: 'Not authorized. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log('JWT verification successful for user:', decoded.email);
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