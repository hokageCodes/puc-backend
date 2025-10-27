import jwt from 'jsonwebtoken';
import Staff from '../models/Staff.js';

// Authenticate staff from JWT token stored in cookie
export const authenticateStaff = async (req, res, next) => {
  try {
    const token = req.cookies?.staff_token || req.headers?.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get staff from database
    const staff = await Staff.findById(decoded.id).select('-password');
    
    if (!staff) {
      return res.status(401).json({ message: 'Staff not found' });
    }

    req.staff = staff;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Check if user is staff
export const isStaff = (req, res, next) => {
  if (req.staff) {
    return next();
  }
  return res.status(403).json({ message: 'Access denied. Staff role required.' });
};

// Check if user is team lead
export const isTeamLead = (req, res, next) => {
  if (req.staff && req.staff.isTeamLead) {
    return next();
  }
  return res.status(403).json({ message: 'Access denied. Team Lead role required.' });
};

// Check if user is line manager
export const isLineManager = (req, res, next) => {
  if (req.staff && req.staff.isLineManager) {
    return next();
  }
  return res.status(403).json({ message: 'Access denied. Line Manager role required.' });
};

// Check if user is HR/Admin
export const isHR = async (req, res, next) => {
  if (req.staff && (req.staff.isLineManager || req.staff.isTeamLead)) {
    // HR can be identified by checking if they have full admin privileges
    // For now, we'll consider isLineManager as HR role
    // You can add a specific isHR field if needed
    return next();
  }
  return res.status(403).json({ message: 'Access denied. HR/Admin role required.' });
};

// Check if user can approve a specific leave request
export const canApproveLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    const leaveRequest = await LeaveRequest.findById(id).populate('staff');
    
    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    const staff = req.staff;
    
    // Check approval permissions based on workflow step and role
    if (leaveRequest.workflowStep === 'teamlead' && staff._id.toString() === leaveRequest.staff.teamLeadId?.toString()) {
      return next(); // Team lead can approve
    }
    
    if (leaveRequest.workflowStep === 'linemanager' && staff._id.toString() === leaveRequest.staff.lineManagerId?.toString()) {
      return next(); // Line manager can approve
    }
    
    if (leaveRequest.workflowStep === 'hr' && staff.isLineManager) {
      return next(); // HR can approve
    }

    return res.status(403).json({ message: 'You are not authorized to approve this leave request' });
    
  } catch (error) {
    return res.status(500).json({ message: 'Error checking approval permissions', error: error.message });
  }
};

import LeaveRequest from '../models/LeaveRequest.js';

// Export all middleware
export default {
  authenticateStaff,
  isStaff,
  isTeamLead,
  isLineManager,
  isHR,
  canApproveLeave
};

