import LeaveRequest from '../models/LeaveRequest.js';
import Staff from '../models/Staff.js';

// Get personal calendar (staff's own approved leaves)
export const getPersonalCalendar = async (req, res) => {
  try {
    const staff = req.staff;
    const { startDate, endDate } = req.query;

    let query = {
      staff: staff._id,
      status: { $in: ['approved_teamlead', 'approved_linemanager', 'approved_hr'] }
    };

    if (startDate && endDate) {
      query.$or = [
        {
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        }
      ];
    }

    const leaves = await LeaveRequest.find(query)
      .populate('leaveType', 'name')
      .select('startDate endDate leaveType totalDays status');

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching personal calendar', error: error.message });
  }
};

// Get team calendar (team members' approved leaves)
export const getTeamCalendar = async (req, res) => {
  try {
    const staff = req.staff;
    
    if (!staff.isTeamLead) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const teamMembers = await Staff.find({ teamLeadId: staff._id });
    const teamMemberIds = teamMembers.map(m => m._id);

    const { startDate, endDate } = req.query;

    let query = {
      staff: { $in: teamMemberIds },
      status: { $in: ['approved_teamlead', 'approved_linemanager', 'approved_hr'] }
    };

    if (startDate && endDate) {
      query.$or = [
        {
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        }
      ];
    }

    const leaves = await LeaveRequest.find(query)
      .populate('staff', 'firstName lastName')
      .populate('leaveType', 'name')
      .select('staff startDate endDate leaveType totalDays');

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching team calendar', error: error.message });
  }
};

// Get department calendar (department members' approved leaves)
export const getDepartmentCalendar = async (req, res) => {
  try {
    const staff = req.staff;
    
    if (!staff.isLineManager) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const departmentMembers = await Staff.find({ lineManagerId: staff._id });
    const departmentMemberIds = departmentMembers.map(m => m._id);

    const { startDate, endDate } = req.query;

    let query = {
      staff: { $in: departmentMemberIds },
      status: { $in: ['approved_teamlead', 'approved_linemanager', 'approved_hr'] }
    };

    if (startDate && endDate) {
      query.$or = [
        {
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        }
      ];
    }

    const leaves = await LeaveRequest.find(query)
      .populate('staff', 'firstName lastName department team')
      .populate('leaveType', 'name')
      .select('staff startDate endDate leaveType totalDays');

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching department calendar', error: error.message });
  }
};

// Get company calendar (all approved leaves - HR only)
export const getCompanyCalendar = async (req, res) => {
  try {
    const staff = req.staff;
    
    if (!staff.isLineManager && !staff.isTeamLead) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { startDate, endDate } = req.query;

    let query = {
      status: { $in: ['approved_teamlead', 'approved_linemanager', 'approved_hr'] }
    };

    if (startDate && endDate) {
      query.$or = [
        {
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        }
      ];
    }

    const leaves = await LeaveRequest.find(query)
      .populate('staff', 'firstName lastName email department team')
      .populate('leaveType', 'name')
      .populate('team', 'name')
      .select('staff startDate endDate leaveType totalDays team department');

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching company calendar', error: error.message });
  }
};

export default {
  getPersonalCalendar,
  getTeamCalendar,
  getDepartmentCalendar,
  getCompanyCalendar
};

