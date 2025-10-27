import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Staff from '../models/Staff.js';

// Staff Login
export const staffLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Find staff by email
    const staff = await Staff.findOne({ email }).select('+password');

    if (!staff) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if staff has a password set
    if (!staff.password) {
      // First time login - set password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      staff.password = hashedPassword;
      await staff.save();
    } else {
      // Verify existing password
      const isMatch = await bcrypt.compare(password, staff.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        id: staff._id,
        email: staff.email,
        isTeamLead: staff.isTeamLead,
        isLineManager: staff.isLineManager
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('staff_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      token,
      staff: {
        _id: staff._id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        isTeamLead: staff.isTeamLead,
        isLineManager: staff.isLineManager,
        department: staff.department,
        team: staff.team
      }
    });
  } catch (error) {
    console.error('Staff login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Staff Logout
export const staffLogout = async (req, res) => {
  try {
    res.cookie('staff_token', '', {
      httpOnly: true,
      expires: new Date(0)
    });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during logout' });
  }
};

// Get Current Staff
export const getCurrentStaff = async (req, res) => {
  try {
    const staff = await Staff.findById(req.staff._id)
      .populate('department', 'name')
      .populate('team', 'name')
      .select('-password');

    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export default {
  staffLogin,
  staffLogout,
  getCurrentStaff
};

