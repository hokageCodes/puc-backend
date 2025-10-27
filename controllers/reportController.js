import LeaveRequest from '../models/LeaveRequest.js';
import Staff from '../models/Staff.js';
import LeaveType from '../models/LeaveType.js';

// Generate staff report
export const generateStaffReport = async (req, res) => {
  try {
    const staff = req.staff;
    const { startDate, endDate } = req.query;

    let query = { staff: staff._id };

    if (startDate && endDate) {
      query.startDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const leaves = await LeaveRequest.find(query)
      .populate('leaveType', 'name')
      .sort({ createdAt: -1 });

    // Calculate summary
    const summary = {
      totalRequests: leaves.length,
      approved: leaves.filter(l => l.status.includes('approved')).length,
      rejected: leaves.filter(l => l.status === 'rejected').length,
      pending: leaves.filter(l => l.status === 'pending').length,
      totalDays: leaves.filter(l => l.status.includes('approved')).reduce((sum, l) => sum + l.totalDays, 0),
      byLeaveType: {}
    };

    leaves.forEach(leave => {
      const type = leave.leaveType.name;
      if (!summary.byLeaveType[type]) {
        summary.byLeaveType[type] = { count: 0, totalDays: 0 };
      }
      summary.byLeaveType[type].count++;
      if (leave.status.includes('approved')) {
        summary.byLeaveType[type].totalDays += leave.totalDays;
      }
    });

    res.json({ leaves, summary });
  } catch (error) {
    res.status(500).json({ message: 'Error generating staff report', error: error.message });
  }
};

// Generate team report (Team Lead)
export const generateTeamReport = async (req, res) => {
  try {
    const staff = req.staff;
    
    if (!staff.isTeamLead) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const teamMembers = await Staff.find({ teamLeadId: staff._id });
    const teamMemberIds = teamMembers.map(m => m._id);

    const { startDate, endDate } = req.query;

    let query = { staff: { $in: teamMemberIds } };

    if (startDate && endDate) {
      query.startDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const leaves = await LeaveRequest.find(query)
      .populate('staff', 'firstName lastName email')
      .populate('leaveType', 'name')
      .sort({ startDate: 1 });

    // Calculate summary
    const summary = {
      teamSize: teamMembers.length,
      totalRequests: leaves.length,
      approved: leaves.filter(l => l.status.includes('approved')).length,
      pending: leaves.filter(l => l.status === 'pending').length,
      byStaff: {},
      byLeaveType: {}
    };

    leaves.forEach(leave => {
      const staffName = `${leave.staff.firstName} ${leave.staff.lastName}`;
      const type = leave.leaveType.name;

      if (!summary.byStaff[staffName]) {
        summary.byStaff[staffName] = { requests: 0, approved: 0, totalDays: 0 };
      }
      summary.byStaff[staffName].requests++;
      if (leave.status.includes('approved')) {
        summary.byStaff[staffName].approved++;
        summary.byStaff[staffName].totalDays += leave.totalDays;
      }

      if (!summary.byLeaveType[type]) {
        summary.byLeaveType[type] = { count: 0, days: 0 };
      }
      summary.byLeaveType[type].count++;
      if (leave.status.includes('approved')) {
        summary.byLeaveType[type].days += leave.totalDays;
      }
    });

    res.json({ leaves, summary });
  } catch (error) {
    res.status(500).json({ message: 'Error generating team report', error: error.message });
  }
};

// Generate department report (Line Manager)
export const generateDepartmentReport = async (req, res) => {
  try {
    const staff = req.staff;
    
    if (!staff.isLineManager) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const departmentMembers = await Staff.find({ lineManagerId: staff._id });
    const departmentMemberIds = departmentMembers.map(m => m._id);

    const { startDate, endDate } = req.query;

    let query = { staff: { $in: departmentMemberIds } };

    if (startDate && endDate) {
      query.startDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const leaves = await LeaveRequest.find(query)
      .populate('staff', 'firstName lastName email department')
      .populate('leaveType', 'name')
      .sort({ startDate: 1 });

    // Calculate summary
    const summary = {
      departmentSize: departmentMembers.length,
      totalRequests: leaves.length,
      approved: leaves.filter(l => l.status.includes('approved')).length,
      pending: leaves.filter(l => l.status === 'pending').length,
      byStaff: {},
      byLeaveType: {}
    };

    leaves.forEach(leave => {
      const staffName = `${leave.staff.firstName} ${leave.staff.lastName}`;
      const type = leave.leaveType.name;

      if (!summary.byStaff[staffName]) {
        summary.byStaff[staffName] = { requests: 0, approved: 0, totalDays: 0 };
      }
      summary.byStaff[staffName].requests++;
      if (leave.status.includes('approved')) {
        summary.byStaff[staffName].approved++;
        summary.byStaff[staffName].totalDays += leave.totalDays;
      }

      if (!summary.byLeaveType[type]) {
        summary.byLeaveType[type] = { count: 0, days: 0 };
      }
      summary.byLeaveType[type].count++;
      if (leave.status.includes('approved')) {
        summary.byLeaveType[type].days += leave.totalDays;
      }
    });

    res.json({ leaves, summary });
  } catch (error) {
    res.status(500).json({ message: 'Error generating department report', error: error.message });
  }
};

// Generate company report (HR)
export const generateCompanyReport = async (req, res) => {
  try {
    const staff = req.staff;
    
    if (!staff.isLineManager && !staff.isTeamLead) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { startDate, endDate } = req.query;

    let query = {};

    if (startDate && endDate) {
      query.startDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const leaves = await LeaveRequest.find(query)
      .populate('staff', 'firstName lastName email department')
      .populate('leaveType', 'name')
      .sort({ createdAt: -1 });

    const allStaff = await Staff.find();
    
    // Calculate summary
    const summary = {
      totalStaff: allStaff.length,
      totalRequests: leaves.length,
      approved: leaves.filter(l => l.status.includes('approved')).length,
      rejected: leaves.filter(l => l.status === 'rejected').length,
      pending: leaves.filter(l => l.status === 'pending').length,
      byDepartment: {},
      byLeaveType: {}
    };

    leaves.forEach(leave => {
      const dept = leave.staff.department?.name || 'Unknown';
      const type = leave.leaveType.name;

      if (!summary.byDepartment[dept]) {
        summary.byDepartment[dept] = { requests: 0, approved: 0, totalDays: 0 };
      }
      summary.byDepartment[dept].requests++;
      if (leave.status.includes('approved')) {
        summary.byDepartment[dept].approved++;
        summary.byDepartment[dept].totalDays += leave.totalDays;
      }

      if (!summary.byLeaveType[type]) {
        summary.byLeaveType[type] = { count: 0, days: 0 };
      }
      summary.byLeaveType[type].count++;
      if (leave.status.includes('approved')) {
        summary.byLeaveType[type].days += leave.totalDays;
      }
    });

    res.json({ leaves, summary });
  } catch (error) {
    res.status(500).json({ message: 'Error generating company report', error: error.message });
  }
};

export default {
  generateStaffReport,
  generateTeamReport,
  generateDepartmentReport,
  generateCompanyReport
};

