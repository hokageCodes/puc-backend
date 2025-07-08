import Staff from '../models/Staff.js';

// GET /api/staff
export const getAllStaff = async (req, res) => {
  try {
    const staff = await Staff.find()
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name');

    res.json(staff);
  } catch (err) {
    console.error('❌ Error in getAllStaff:', err);
    res.status(500).json({ error: 'Failed to fetch staff', details: err.message });
  }
};

// GET /api/staff/:id
export const getStaffById = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: 'Error getting staff' });
  }
};

// POST /api/staff

export const createStaff = async (req, res) => {
  try {
    const data = req.body;

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

    const newStaff = new Staff({
      ...rest,
      ...(department ? { department } : {}),
      ...(team ? { team } : {}),
      ...(practiceAreas ? { practiceAreas } : {}),
      profilePhoto: profilePhotoUrl, // ✅ Save Cloudinary URL
    });

    await newStaff.save();
    res.status(201).json(newStaff);
  } catch (err) {
    console.error('❌ Staff creation failed:', err);
    res.status(400).json({ error: 'Failed to create staff', details: err.message });
  }
};



// PUT /api/staff/:id
export const updateStaff = async (req, res) => {
  try {
    const updated = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Staff not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Error updating staff', details: err });
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

