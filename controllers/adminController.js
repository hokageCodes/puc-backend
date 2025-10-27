// controllers/adminController.js
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    console.log('Login attempt for email:', email);

    const admin = await Admin.findOne({ email });
    if (!admin) {
      console.log('Admin not found for email:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('Found admin:', {
      id: admin._id,
      email: admin.email,
      isAdmin: admin.isAdmin
    });

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      console.log('Password mismatch for email:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        id: admin._id, 
        email: admin.email,
        isAdmin: admin.isAdmin 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Generated token:', token.substring(0, 50) + '...');

    // Enhanced cookie configuration for production
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? undefined : undefined // Let browser handle domain
    };

    console.log('Setting cookie with options:', cookieOptions);
    console.log('Environment:', process.env.NODE_ENV);

    // Set the cookie
    res.cookie('admin_token', token, cookieOptions);

    // Also set a test cookie to verify cookie setting works
    res.cookie('test_cookie', 'test_value', {
      httpOnly: false, // Make it accessible to JS for testing
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });

    // Prepare response data
    const responseData = {
      message: 'Login successful',
      token: token, // Add token to response for localStorage fallback
      admin: {
        id: admin._id,
        email: admin.email,
        isAdmin: admin.isAdmin,
      },
      // Add debug info
      debug: {
        cookieSet: true,
        environment: process.env.NODE_ENV,
        tokenLength: token.length
      }
    };

    console.log('Login successful, sending response:', responseData);

    // Send response
    res.json(responseData);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMe = async (req, res) => {
  try {
    console.log('Getting admin profile for user:', req.user);
    
    const admin = await Admin.findById(req.user.id).select('-password');
    if (!admin) {
      console.log('Admin not found for ID:', req.user.id);
      return res.status(404).json({ message: 'Admin not found' });
    }

    const responseData = {
      admin: {
        id: admin._id,
        email: admin.email,
        isAdmin: admin.isAdmin,
      },
    };

    console.log('Get me successful, sending response:', responseData);

    res.json(responseData);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const logout = (req, res) => {
  console.log('Admin logout:', req.user?.email);
  
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/'
  };

  res.clearCookie('admin_token', cookieOptions);
  res.clearCookie('test_cookie', cookieOptions);
  
  res.json({ message: 'Logged out successfully' });
};