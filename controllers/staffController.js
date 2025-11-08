import Staff from '../models/Staff.js';
import Counter from '../models/Counter.js';

const ALLOWED_ROLES = new Set(['staff', 'teamLead', 'lineManager', 'hr', 'admin', 'cms']);
const STAFF_DIVISIONS = ['legal', 'admin', 'other'];

const parseBoolean = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lowered)) return true;
    if (['false', '0', 'no', 'off'].includes(lowered)) return false;
  }
  return defaultValue;
};

const normalizeRoles = (value) => {
  const rolesArray = Array.isArray(value)
    ? value
    : value
    ? String(value)
        .split(',')
        .map((role) => role.trim())
    : [];

  const sanitized = rolesArray
    .map((role) => role.toString().trim())
    .filter((role) => role.length > 0 && ALLOWED_ROLES.has(role));

  const unique = Array.from(new Set(['staff', ...sanitized]));
  return unique;
};

const normalizeDivision = (value) => {
  if (!value) return 'legal';
  const normalized = value.toString().trim().toLowerCase();
  return STAFF_DIVISIONS.includes(normalized) ? normalized : 'legal';
};

const normalizeObjectIdField = (value) => {
  if (!value || value === '') return undefined;
  return value;
};

const normalizeDate = (value) => {
  if (!value || value === '') return undefined;
  const dateValue = new Date(value);
  return Number.isNaN(dateValue.getTime()) ? undefined : dateValue;
};

const getNextStaffCode = async () => {
  await syncStaffCodeCounter();
  const counter = await Counter.findByIdAndUpdate(
    { _id: 'staffCode' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `PUC${String(counter.seq).padStart(3, '0')}`;
};

const ensureStaffCode = async (staffDoc) => {
  if (!staffDoc?.staffCode) {
    staffDoc.staffCode = await getNextStaffCode();
    await staffDoc.save();
  }
  return staffDoc;
};

let indexEnsured = false;
let counterSynced = false;

const syncStaffCodeCounter = async () => {
  if (counterSynced) return;

  const latest = await Staff.findOne({ staffCode: { $exists: true } })
    .sort({ staffCode: -1 })
    .select('staffCode')
    .lean();

  let maxSeq = 0;
  if (latest?.staffCode) {
    const match = latest.staffCode.match(/(\d+)$/);
    if (match) {
      maxSeq = parseInt(match[1], 10);
    }
  }

  await Counter.findByIdAndUpdate(
    { _id: 'staffCode' },
    { $set: { seq: maxSeq } },
    { upsert: true }
  );

  counterSynced = true;
};
const ensureEmployeeIdIndex = async () => {
  if (indexEnsured) return;
  try {
    await Staff.collection.dropIndex('employeeId_1');
    console.log('🔁 Dropped legacy employeeId index');
  } catch (err) {
    if (err.codeName !== 'IndexNotFound' && err.code !== 27) {
      console.warn('⚠️ Could not drop legacy employeeId index:', err.message);
    }
  }
  try {
    await Staff.collection.createIndex({ employeeId: 1 }, { unique: true, sparse: true });
    console.log('✅ Ensured employeeId unique sparse index');
  } catch (err) {
    console.warn('⚠️ Could not create employeeId index:', err.message);
  }
  indexEnsured = true;
};

// GET /api/staff
export const getAllStaff = async (req, res) => {
  try {
    await ensureEmployeeIdIndex();
    await syncStaffCodeCounter();
    const staffList = await Staff.find()
      .sort({ staffCode: 1, createdAt: 1 })
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name')
      .populate('teamLeadId', 'firstName lastName staffCode')
      .populate('lineManagerId', 'firstName lastName staffCode');

    await Promise.all(staffList.map(ensureStaffCode));

    res.json(staffList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff list', details: err.message });
  }
};


// GET /api/staff/:id
export const getStaffById = async (req, res) => {
  try {
    await ensureEmployeeIdIndex();
    await syncStaffCodeCounter();

    let staff = await Staff.findById(req.params.id)
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name')
      .populate('teamLeadId', 'firstName lastName staffCode')
      .populate('lineManagerId', 'firstName lastName staffCode'); // ✅ Ensure this is included

    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    staff = await ensureStaffCode(staff);

    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff', details: err.message });
  }
};
// POST /api/staff

export const createStaff = async (req, res) => {
  try {
    const data = req.body;

    await ensureEmployeeIdIndex();
    await syncStaffCodeCounter();

    const profilePhotoUrl = req.file?.path;

    let {
      department,
      team,
      practiceAreas,
      roles,
      division,
      teamLeadId,
      lineManagerId,
      leaveEnabled,
      hireDate,
      confirmationDate,
      staffCode, // ignore manual override
      ...rest
    } = data;

    if (rest.employeeId === '' || rest.employeeId === null) {
      delete rest.employeeId;
    }

    const visibilityValue = parseBoolean(rest.isVisible, true);
    delete rest.isVisible;

    const normalizedRoles = normalizeRoles(roles);
    const normalizedDivision = normalizeDivision(division);
    const normalizedLeaveEnabled = parseBoolean(leaveEnabled, true);
    const normalizedTeamLeadId = normalizeObjectIdField(teamLeadId);
    const normalizedLineManagerId = normalizeObjectIdField(lineManagerId);
    const normalizedHireDate = normalizeDate(hireDate);
    const normalizedConfirmationDate = normalizeDate(confirmationDate);

    if (department === '') department = undefined;
    if (team === '') team = undefined;
    if (practiceAreas) {
      if (typeof practiceAreas === 'string') {
        practiceAreas = [practiceAreas];
      }
      practiceAreas = practiceAreas.filter((id) => id && id !== '');
      if (practiceAreas.length === 0) practiceAreas = undefined;
    }

    const newStaff = new Staff({
      ...rest,
      division: normalizedDivision,
      roles: normalizedRoles,
      leaveEnabled: normalizedLeaveEnabled,
      hireDate: normalizedHireDate,
      confirmationDate: normalizedConfirmationDate,
      ...(department ? { department } : {}),
      ...(team ? { team } : {}),
      ...(practiceAreas ? { practiceAreas } : {}),
      ...(normalizedTeamLeadId ? { teamLeadId: normalizedTeamLeadId } : {}),
      ...(normalizedLineManagerId ? { lineManagerId: normalizedLineManagerId } : {}),
      profilePhoto: profilePhotoUrl,
      isVisible: visibilityValue,
      staffCode: await getNextStaffCode(),
    });

    await newStaff.save();

    const populated = await Staff.findById(newStaff._id)
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name')
      .populate('teamLeadId', 'firstName lastName staffCode')
      .populate('lineManagerId', 'firstName lastName staffCode');

    res.status(201).json(populated);
  } catch (err) {
    console.error('❌ Staff creation failed:', err);
    res.status(err.name === 'ValidationError' ? 400 : 500).json({
      error: 'Failed to create staff',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
};



// PUT /api/staff/:id
export const updateStaff = async (req, res) => {
  try {
    const data = req.body;
    const id = req.params.id;

    const profilePhotoUrl = req.file?.path;

    let {
      department,
      team,
      practiceAreas,
      removeImage,
      roles,
      division,
      teamLeadId,
      lineManagerId,
      leaveEnabled,
      hireDate,
      confirmationDate,
      staffCode, // ignore immutable field
      ...rest
    } = data;

    await ensureEmployeeIdIndex();
    await syncStaffCodeCounter();

    const parsedVisible = parseBoolean(rest.isVisible, undefined);
    delete rest.isVisible;

    const updateData = { ...rest };
    const unsetData = {};

    if (parsedVisible !== undefined) {
      updateData.isVisible = parsedVisible;
    }

    if (division !== undefined) {
      updateData.division = normalizeDivision(division);
    }

    if (roles !== undefined) {
      const normalizedRoles = normalizeRoles(roles);
      updateData.roles = normalizedRoles;
    }

    const parsedLeaveEnabled = leaveEnabled !== undefined ? parseBoolean(leaveEnabled, undefined) : undefined;
    if (parsedLeaveEnabled !== undefined) {
      updateData.leaveEnabled = parsedLeaveEnabled;
    }

    const normalizedHireDate = normalizeDate(hireDate);
    if (hireDate !== undefined) {
      if (normalizedHireDate) {
        updateData.hireDate = normalizedHireDate;
      } else {
        unsetData.hireDate = '';
      }
    }

    const normalizedConfirmationDate = normalizeDate(confirmationDate);
    if (confirmationDate !== undefined) {
      if (normalizedConfirmationDate) {
        updateData.confirmationDate = normalizedConfirmationDate;
      } else {
        unsetData.confirmationDate = '';
      }
    }

    const normalizedTeamLeadId = normalizeObjectIdField(teamLeadId);
    if (teamLeadId !== undefined) {
      if (normalizedTeamLeadId) {
        updateData.teamLeadId = normalizedTeamLeadId;
      } else {
        unsetData.teamLeadId = '';
      }
    }

    const normalizedLineManagerId = normalizeObjectIdField(lineManagerId);
    if (lineManagerId !== undefined) {
      if (normalizedLineManagerId) {
        updateData.lineManagerId = normalizedLineManagerId;
      } else {
        unsetData.lineManagerId = '';
      }
    }

    if (department === '') {
      unsetData.department = '';
    } else if (department) {
      updateData.department = department;
    }

    if (team === '') {
      unsetData.team = '';
    } else if (team) {
      updateData.team = team;
    }

    if (practiceAreas !== undefined) {
      let areas = practiceAreas;
      if (typeof areas === 'string') {
        areas = [areas];
      }
      if (Array.isArray(areas)) {
        const cleaned = areas.filter((pid) => pid && pid !== '');
        if (cleaned.length > 0) {
          updateData.practiceAreas = cleaned;
        } else {
          unsetData.practiceAreas = '';
        }
      }
    }

    if (rest.employeeId !== undefined) {
      if (rest.employeeId === '' || rest.employeeId === null) {
        unsetData.employeeId = '';
      } else {
        updateData.employeeId = rest.employeeId;
      }
      delete rest.employeeId;
    }

    if (profilePhotoUrl) {
      updateData.profilePhoto = profilePhotoUrl;
    } else if (removeImage === 'true') {
      unsetData.profilePhoto = '';
    }

    if (staffCode) {
      delete updateData.staffCode;
    }

    const updatePayload = {};
    if (Object.keys(updateData).length > 0) {
      updatePayload.$set = updateData;
    }
    if (Object.keys(unsetData).length > 0) {
      updatePayload.$unset = unsetData;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    const updated = await Staff.findByIdAndUpdate(id, updatePayload, { new: true });
    if (!updated) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const populatedDoc = await Staff.findById(updated._id)
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name')
      .populate('teamLeadId', 'firstName lastName staffCode')
      .populate('lineManagerId', 'firstName lastName staffCode');

    const ensuredDoc = await ensureStaffCode(populatedDoc);

    res.json(ensuredDoc);
  } catch (err) {
    console.error('❌ Staff update failed:', err);
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

