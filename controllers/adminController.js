const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', { email, password: '***' });
    
    const admin = await Admin.findOne({ email });
    console.log('Admin found:', !!admin);
    
    if (!admin) {
      console.log('No admin found with email:', email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    console.log('Comparing passwords...');
    const isMatch = await admin.comparePassword(password);
    console.log('Password match:', isMatch);
    
    if (!isMatch) {
      console.log('Password comparison failed');
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    console.log('JWT token generated successfully');

    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    console.log('Login successful for:', email);
    res.json({ message: 'Login successful' });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getMe = async (req, res) => {
  const admin = await Admin.findById(req.user.id).select('-password');
  res.json(admin);
};


exports.logout = (req, res) => {
  res.clearCookie('admin_token', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });

  console.log('✅ Admin logged out. Cookie cleared.');
  res.status(200).json({ message: 'Logged out' });
};
