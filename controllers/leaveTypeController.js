import LeaveType from '../models/LeaveType.js';

// Get all active leave types
export const getAllLeaveTypes = async (req, res) => {
  try {
    const leaveTypes = await LeaveType.find({ isActive: true })
      .sort({ createdAt: 1 });

    res.json(leaveTypes);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching leave types', error: error.message });
  }
};

// Get all leave types including inactive (HR)
export const getAllLeaveTypesAdmin = async (req, res) => {
  try {
    const leaveTypes = await LeaveType.find()
      .sort({ createdAt: 1 });

    res.json(leaveTypes);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching leave types', error: error.message });
  }
};

// Create leave type (HR only)
export const createLeaveType = async (req, res) => {
  try {
    const { name, description, defaultDays, requiresDocument } = req.body;

    // Check if leave type already exists
    const existing = await LeaveType.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: 'Leave type already exists' });
    }

    const leaveType = await LeaveType.create({
      name,
      description,
      defaultDays,
      requiresDocument: requiresDocument || false
    });

    res.status(201).json(leaveType);
  } catch (error) {
    res.status(500).json({ message: 'Error creating leave type', error: error.message });
  }
};

// Update leave type (HR only)
export const updateLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, defaultDays, requiresDocument, isActive } = req.body;

    const leaveType = await LeaveType.findById(id);

    if (!leaveType) {
      return res.status(404).json({ message: 'Leave type not found' });
    }

    if (name) leaveType.name = name;
    if (description !== undefined) leaveType.description = description;
    if (defaultDays !== undefined) leaveType.defaultDays = defaultDays;
    if (requiresDocument !== undefined) leaveType.requiresDocument = requiresDocument;
    if (isActive !== undefined) leaveType.isActive = isActive;

    await leaveType.save();

    res.json(leaveType);
  } catch (error) {
    res.status(500).json({ message: 'Error updating leave type', error: error.message });
  }
};

// Delete/deactivate leave type (HR only)
export const deleteLeaveType = async (req, res) => {
  try {
    const { id } = req.params;

    const leaveType = await LeaveType.findById(id);

    if (!leaveType) {
      return res.status(404).json({ message: 'Leave type not found' });
    }

    // Soft delete by setting isActive to false
    leaveType.isActive = false;
    await leaveType.save();

    res.json({ message: 'Leave type deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting leave type', error: error.message });
  }
};

export default {
  getAllLeaveTypes,
  getAllLeaveTypesAdmin,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType
};

