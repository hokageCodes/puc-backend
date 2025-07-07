const Department = require('../models/Department');

// GET /api/departments
exports.getDepartments = async (req, res) => {
  try {
    const departments = await Department.find();
    res.json(departments);
  } catch (err) {
    console.error('❌ Failed to load departments:', err.message);
    res.status(500).json({ error: 'Failed to load departments', details: err.message });
  }
};
