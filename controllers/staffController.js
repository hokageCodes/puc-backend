import Staff from '../models/Staff.js';

// GET /api/staff
export const getAllStaff = async (req, res) => {
  try {
    const staffList = await Staff.find()
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name'); // ✅ Populate names here too

    res.json(staffList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff list', details: err.message });
  }
};


// GET /api/staff/:id
export const getStaffById = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id)
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name'); // ✅ Ensure this is included

    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff', details: err.message });
  }
};
// POST /api/staff

export const createStaff = async (req, res) => {
  try {
    const data = req.body;
    
    console.log('📦 Received staff data:', JSON.stringify(data, null, 2));
    console.log('📸 Profile photo:', req.file?.path);

    const profilePhotoUrl = req.file?.path; // ✅ Cloudinary file URL

    let { department, team, practiceAreas, ...rest } = data;

    if (department === '') department = undefined;
    if (team === '') team = undefined;
    if (practiceAreas) {
      if (typeof practiceAreas === 'string') {
        practiceAreas = [practiceAreas];
      }
      practiceAreas = practiceAreas.filter((id) => id !== '');
      if (practiceAreas.length === 0) practiceAreas = undefined;
    }

    // Handle leave management fields
    const leaveFields = {
      isOnProbation: data.isOnProbation === 'true' || data.isOnProbation === true,
      // Only add employeeId if it's provided
      ...(data.employeeId && data.employeeId.trim() ? { employeeId: data.employeeId.trim() } : {}),
      ...(data.hireDate ? { hireDate: new Date(data.hireDate) } : {}),
      isTeamLead: data.isTeamLead === 'true' || data.isTeamLead === true,
      isLineManager: data.isLineManager === 'true' || data.isLineManager === true,
    };

    const newStaff = new Staff({
      ...rest,
      ...leaveFields,
      ...(department ? { department } : {}),
      ...(team ? { team } : {}),
      ...(practiceAreas ? { practiceAreas } : {}),
      profilePhoto: profilePhotoUrl, // ✅ Save Cloudinary URL
    });

    await newStaff.save();
    
    // Populate and return
    const populated = await Staff.findById(newStaff._id)
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name');
    
    res.status(201).json(populated);
  } catch (err) {
    console.error('❌ Staff creation failed:', err);
    // Better error handling for 500 errors
    res.status(err.name === 'ValidationError' ? 400 : 500).json({ 
      error: 'Failed to create staff', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};



// PUT /api/staff/:id
export const updateStaff = async (req, res) => {
  try {
    const updated = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Staff not found' });

    const populated = await Staff.findById(updated._id)
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update staff', details: err.message });
  }
};

// DELETE /api/staff/:id
export const deleteStaff = async (req, res) => {
  try {
    const deleted = await Staff.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Staff not found' });
    res.json({ message: 'Staff deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting staff', details: err.message });
  }
};

