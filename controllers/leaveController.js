import LeaveRequest from '../models/LeaveRequest.js';
import Staff from '../models/Staff.js';
import LeaveType from '../models/LeaveType.js';
import StaffLeaveBalance from '../models/StaffLeaveBalance.js';

// Calculate total working days between two dates
const calculateWorkingDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  
  while (start <= end) {
    const dayOfWeek = start.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
      count++;
    }
    start.setDate(start.getDate() + 1);
  }
  
  return count;
};

// Create leave request
export const createLeaveRequest = async (req, res) => {
  try {
    const { leaveTypeId, startDate, endDate, reason } = req.body;
    const staff = req.staff;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end < start) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    // Check if leave type exists
    const leaveType = await LeaveType.findById(leaveTypeId);
    if (!leaveType) {
      return res.status(404).json({ message: 'Leave type not found' });
    }

    // Calculate total days
    const totalDays = calculateWorkingDays(start, end);

    // Check available balance
    const balance = await StaffLeaveBalance.findOne({
      staff: staff._id,
      leaveType: leaveTypeId,
      year: new Date().getFullYear()
    });

    if (!balance || balance.allocated - balance.used < totalDays) {
      return res.status(400).json({ message: 'Insufficient leave balance' });
    }

    // Determine workflow
    let workflowStep = 'hr'; // Default to HR
    let currentApprover = null;

    if (staff.teamLeadId) {
      workflowStep = 'teamlead';
      currentApprover = staff.teamLeadId;
    }

    // Create leave request
    const leaveRequest = await LeaveRequest.create({
      staff: staff._id,
      leaveType: leaveTypeId,
      startDate,
      endDate,
      totalDays,
      reason,
      status: 'pending',
      workflowStep,
      currentApprover
    });

    await leaveRequest.populate('leaveType', 'name description defaultDays');
    await leaveRequest.populate('staff', 'firstName lastName email');

    res.status(201).json(leaveRequest);
  } catch (error) {
    res.status(500).json({ message: 'Error creating leave request', error: error.message });
  }
};

// Get my leaves
export const getMyLeaves = async (req, res) => {
  try {
    const staff = req.staff;
    const leaves = await LeaveRequest.find({ staff: staff._id })
      .populate('leaveType', 'name description')
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching leaves', error: error.message });
  }
};

// Get pending approvals for current user
export const getPendingApprovals = async (req, res) => {
  try {
    const staff = req.staff;
    let query = {};

    // Team Lead sees team member requests
    if (staff.isTeamLead) {
      const teamMembers = await Staff.find({ teamLeadId: staff._id });
      const teamMemberIds = teamMembers.map(m => m._id);
      query = {
        $or: [
          { staff: { $in: teamMemberIds }, workflowStep: 'teamlead', status: 'pending' },
          { currentApprover: staff._id, workflowStep: 'teamlead', status: 'pending' }
        ]
      };
    } 
    // Line Manager sees approvals from team leads and direct reports
    else if (staff.isLineManager) {
      const reports = await Staff.find({ lineManagerId: staff._id });
      const reportIds = reports.map(r => r._id);
      query = {
        $or: [
          { staff: { $in: reportIds }, workflowStep: 'linemanager', status: { $in: ['approved_teamlead', 'pending'] } },
          { currentApprover: staff._id, workflowStep: 'linemanager', status: { $ne: 'rejected' } }
        ]
      };
    }
    // HR sees all pending final approvals
    else if (staff.isLineManager || staff.isTeamLead) {
      query = {
        status: { $in: ['approved_teamlead', 'approved_linemanager'] },
        workflowStep: 'hr'
      };
    }

    const leaves = await LeaveRequest.find(query)
      .populate('staff', 'firstName lastName email position')
      .populate('leaveType', 'name')
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending approvals', error: error.message });
  }
};

// Approve leave
export const approveLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const staff = req.staff;

    const leaveRequest = await LeaveRequest.findById(id)
      .populate('staff')
      .populate('leaveType');

    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    // Determine next workflow step
    let nextStep = null;
    let nextApprover = null;

    if (leaveRequest.workflowStep === 'teamlead') {
      if (leaveRequest.staff.lineManagerId) {
        nextStep = 'linemanager';
        nextApprover = leaveRequest.staff.lineManagerId;
      } else {
        nextStep = 'hr';
        nextApprover = null; // HR approval
      }
      leaveRequest.status = 'approved_teamlead';
    } else if (leaveRequest.workflowStep === 'linemanager') {
      nextStep = 'hr';
      leaveRequest.status = 'approved_linemanager';
    } else if (leaveRequest.workflowStep === 'hr') {
      // Final approval - deduct balance
      const balance = await StaffLeaveBalance.findOne({
        staff: leaveRequest.staff._id,
        leaveType: leaveRequest.leaveType._id,
        year: new Date().getFullYear()
      });

      if (balance) {
        balance.used += leaveRequest.totalDays;
        await balance.save();
      }

      leaveRequest.status = 'approved_hr';
    }

    // Update approval history
    const approvalEntry = {
      approver: staff._id,
      role: staff.isLineManager ? 'Line Manager' : staff.isTeamLead ? 'Team Lead' : 'HR',
      action: 'approved',
      comment: comment || '',
      timestamp: new Date()
    };

    leaveRequest.approvalHistory.push(approvalEntry);
    leaveRequest.workflowStep = nextStep;
    leaveRequest.currentApprover = nextApprover;
    leaveRequest.updatedAt = new Date();

    await leaveRequest.save();

    await leaveRequest.populate('staff', 'firstName lastName email');

    res.json(leaveRequest);
  } catch (error) {
    res.status(500).json({ message: 'Error approving leave', error: error.message });
  }
};

// Reject leave
export const rejectLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, comment } = req.body;
    const staff = req.staff;

    const leaveRequest = await LeaveRequest.findById(id).populate('staff');

    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    // Update status
    leaveRequest.status = 'rejected';
    leaveRequest.rejectionReason = reason;

    // Add to approval history
    const rejectionEntry = {
      approver: staff._id,
      role: staff.isLineManager ? 'Line Manager' : staff.isTeamLead ? 'Team Lead' : 'HR',
      action: 'rejected',
      comment: comment || reason,
      timestamp: new Date()
    };

    leaveRequest.approvalHistory.push(rejectionEntry);
    leaveRequest.workflowStep = null;
    leaveRequest.currentApprover = leaveRequest.staff._id; // Return to staff
    leaveRequest.updatedAt = new Date();

    await leaveRequest.save();

    await leaveRequest.populate('staff', 'firstName lastName email');

    res.json(leaveRequest);
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting leave', error: error.message });
  }
};

// Cancel leave request (staff only)
export const cancelLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const staff = req.staff;

    const leaveRequest = await LeaveRequest.findById(id);

    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    if (leaveRequest.staff.toString() !== staff._id.toString()) {
      return res.status(403).json({ message: 'You can only cancel your own leave requests' });
    }

    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending leave requests can be cancelled' });
    }

    await LeaveRequest.findByIdAndDelete(id);

    res.json({ message: 'Leave request cancelled successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error cancelling leave', error: error.message });
  }
};

// Get team leaves (Team Lead)
export const getTeamLeaves = async (req, res) => {
  try {
    const staff = req.staff;
    
    if (!staff.isTeamLead) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const teamMembers = await Staff.find({ teamLeadId: staff._id });
    const teamMemberIds = teamMembers.map(m => m._id);

    const leaves = await LeaveRequest.find({ staff: { $in: teamMemberIds } })
      .populate('staff', 'firstName lastName email')
      .populate('leaveType', 'name')
      .sort({ startDate: 1 });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching team leaves', error: error.message });
  }
};

// Get department leaves (Line Manager)
export const getDepartmentLeaves = async (req, res) => {
  try {
    const staff = req.staff;
    
    if (!staff.isLineManager) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const departmentMembers = await Staff.find({ lineManagerId: staff._id });
    const departmentMemberIds = departmentMembers.map(m => m._id);

    const leaves = await LeaveRequest.find({ staff: { $in: departmentMemberIds } })
      .populate('staff', 'firstName lastName email')
      .populate('leaveType', 'name')
      .sort({ startDate: 1 });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching department leaves', error: error.message });
  }
};

// Get all leaves (HR)
export const getAllLeaves = async (req, res) => {
  try {
    const leaves = await LeaveRequest.find()
      .populate('staff', 'firstName lastName email department team')
      .populate('leaveType', 'name')
      .populate('currentApprover', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching all leaves', error: error.message });
  }
};

export default {
  createLeaveRequest,
  getMyLeaves,
  getPendingApprovals,
  approveLeave,
  rejectLeave,
  cancelLeaveRequest,
  getTeamLeaves,
  getDepartmentLeaves,
  getAllLeaves
};

