import StaffLeaveBalance from '../models/StaffLeaveBalance.js';
import LeaveType from '../models/LeaveType.js';
import Staff from '../models/Staff.js';

// Get my balance
export const getMyBalance = async (req, res) => {
  try {
    const staff = req.staff;
    const year = new Date().getFullYear();

    const balances = await StaffLeaveBalance.find({
      staff: staff._id,
      year
    }).populate('leaveType', 'name description');

    res.json(balances);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching balance', error: error.message });
  }
};

// Initialize staff balance (HR only)
export const initializeStaffBalance = async (req, res) => {
  try {
    const { staffId, leaveTypeId, allocated } = req.body;

    // Check if balance already exists
    const existing = await StaffLeaveBalance.findOne({
      staff: staffId,
      leaveType: leaveTypeId,
      year: new Date().getFullYear()
    });

    if (existing) {
      return res.status(400).json({ message: 'Balance already exists for this staff and leave type' });
    }

    const balance = await StaffLeaveBalance.create({
      staff: staffId,
      leaveType: leaveTypeId,
      allocated,
      year: new Date().getFullYear()
    });

    await balance.populate('leaveType', 'name description');

    res.status(201).json(balance);
  } catch (error) {
    res.status(500).json({ message: 'Error initializing balance', error: error.message });
  }
};

// Adjust balance (HR only)
export const adjustBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { allocated, used } = req.body;

    const balance = await StaffLeaveBalance.findById(id);

    if (!balance) {
      return res.status(404).json({ message: 'Balance not found' });
    }

    if (allocated !== undefined) balance.allocated = allocated;
    if (used !== undefined) balance.used = used;

    await balance.save();

    await balance.populate('leaveType', 'name description');

    res.json(balance);
  } catch (error) {
    res.status(500).json({ message: 'Error adjusting balance', error: error.message });
  }
};

// Get all balances (HR)
export const getAllBalances = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    
    const balances = await StaffLeaveBalance.find({ year })
      .populate('staff', 'firstName lastName email employeeId')
      .populate('leaveType', 'name description defaultDays')
      .sort({ 'staff.firstName': 1 });

    res.json(balances);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching balances', error: error.message });
  }
};

export default {
  getMyBalance,
  initializeStaffBalance,
  adjustBalance,
  getAllBalances
};

