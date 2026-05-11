import mongoose from 'mongoose';
// Only allow these fields to be set by non-admins
const STAFF_SAFE_FIELDS = [
  'firstName', 'lastName', 'email', 'phoneNumber', 'position', 'bio', 'profilePhoto',
  'department', 'team', 'practiceAreas', 'division', 'teamLeadId', 'lineManagerId', 'hrId',
  'leaveEnabled', 'hireDate', 'confirmationDate', 'isVisible', 'employeeId'
];
import Staff from '../models/Staff.js';
import { logAudit } from '../utils/auditLogger.js';
import Counter from '../models/Counter.js';
import { ALL_ROLES_SET, DEFAULT_ROLE } from '../config/rbac.js';

const ALLOWED_ROLES = ALL_ROLES_SET;
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

  const unique = Array.from(new Set([DEFAULT_ROLE, ...sanitized]));
  return unique;
};

const normalizeDivision = (value) => {
  if (!value) return 'legal';
  const normalized = value.toString().trim().toLowerCase();
  return STAFF_DIVISIONS.includes(normalized) ? normalized : 'legal';
};

const normalizeObjectIdField = (value) => {
  if (!value || value === '') return undefined;
  const normalized = String(value).trim();
  return mongoose.Types.ObjectId.isValid(normalized) ? normalized : undefined;
};

const normalizeDate = (value) => {
  if (!value || value === '') return undefined;
  const dateValue = new Date(value);
  return Number.isNaN(dateValue.getTime()) ? undefined : dateValue;
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || '').trim());

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
    // Only select non-sensitive fields
    const staffList = await Staff.find()
      .select('firstName lastName email phoneNumber position bio profilePhoto department team practiceAreas division teamLeadId lineManagerId hrId leaveEnabled hireDate confirmationDate isVisible employeeId staffCode roles createdAt updatedAt')
      .sort({ staffCode: 1, createdAt: 1 })
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name')
      .populate('teamLeadId', 'firstName lastName staffCode')
      .populate('lineManagerId', 'firstName lastName staffCode')
      .populate('hrId', 'firstName lastName staffCode')
      .lean();

    res.json(staffList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff list', details: err.message });
  }
};

// Public endpoint: GET /api/public/staff
export const getPublicStaff = async (req, res) => {
  try {
    // Only return staff marked visible (or omitted isVisible field)
    const staffList = await Staff.find({ isVisible: { $ne: false } })
      .sort({ displayOrder: 1, createdAt: 1 })
      .select('firstName lastName position profilePhoto bio department team staffCode')
      .populate('department', 'name')
      .populate('team', 'name')
      .lean();

    res.json(staffList);
  } catch (err) {
    console.error('getPublicStaff error:', err);
    res.status(500).json({ error: 'Failed to fetch public staff list', details: err.message });
  }
};

// Public endpoint: GET /api/public/staff/:id
export const getPublicStaffById = async (req, res) => {
  try {
    const staffId = String(req.params.id || '').trim();
    if (!isValidObjectId(staffId)) {
      return res.status(400).json({ error: 'Invalid staff id' });
    }

    const staff = await Staff.findOne({ _id: staffId, isVisible: { $ne: false } })
      .select('firstName lastName position profilePhoto bio email phoneNumber practiceAreas department team staffCode')
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name')
      .lean();

    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    return res.json(staff);
  } catch (err) {
    console.error('getPublicStaffById error:', err);
    return res.status(500).json({ error: 'Failed to fetch public staff detail', details: err.message });
  }
};


// GET /api/staff/:id
export const getStaffById = async (req, res) => {
  try {
    const staffId = String(req.params.id || '').trim();
    if (!isValidObjectId(staffId)) {
      return res.status(400).json({ error: 'Invalid staff id' });
    }

    await ensureEmployeeIdIndex();
    await syncStaffCodeCounter();

    let staff = await Staff.findById(staffId)
      .select('firstName lastName email phoneNumber position bio profilePhoto department team practiceAreas division teamLeadId lineManagerId hrId leaveEnabled hireDate confirmationDate isVisible employeeId staffCode roles createdAt updatedAt')
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name')
      .populate('teamLeadId', 'firstName lastName staffCode')
      .populate('lineManagerId', 'firstName lastName staffCode')
      .populate('hrId', 'firstName lastName staffCode');

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
    await ensureEmployeeIdIndex();
    await syncStaffCodeCounter();

    // RBAC: Only admins can set roles or sensitive fields
    const data = req.body;
    const isAdmin = req.user.roles && req.user.roles.includes('admin');
    let allowedFields = { ...data };
    if (!isAdmin) {
      Object.keys(allowedFields).forEach((key) => {
        if (!STAFF_SAFE_FIELDS.includes(key)) delete allowedFields[key];
      });
    }

    const profilePhotoUrl = req.file?.path;

    let {
      department,
      team,
      practiceAreas,
      roles,
      division,
      teamLeadId,
      lineManagerId,
      hrId,
      leaveEnabled,
      hireDate,
      confirmationDate,
      staffCode, // ignore manual override
      ...rest
    } = allowedFields;

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
    const normalizedHrId = normalizeObjectIdField(hrId);
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
      ...(normalizedHrId ? { hrId: normalizedHrId } : {}),
      ...(profilePhotoUrl ? { profilePhoto: profilePhotoUrl } : {}),
      isVisible: visibilityValue,
    });

    const saved = await newStaff.save();
    const populated = await Staff.findById(saved._id)
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name')
      .populate('teamLeadId', 'firstName lastName staffCode')
      .populate('lineManagerId', 'firstName lastName staffCode')
      .populate('hrId', 'firstName lastName staffCode');

    logAudit('CREATE_STAFF', {
      user: req.user?.id,
      userEmail: req.user?.email,
      staffId: populated._id,
      staffEmail: populated.email,
      ip: req.ip,
    });
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
    await ensureEmployeeIdIndex();
    await syncStaffCodeCounter();

    // RBAC: Only admins can set roles or sensitive fields
    const data = req.body;
    const isAdmin = req.user.roles && req.user.roles.includes('admin');
    let allowedFields = { ...data };
    if (!isAdmin) {
      Object.keys(allowedFields).forEach((key) => {
        if (!STAFF_SAFE_FIELDS.includes(key)) delete allowedFields[key];
      });
    }

    const id = String(req.params.id || '').trim();
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid staff id' });
    }
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
      hrId,
      leaveEnabled,
      hireDate,
      confirmationDate,
      staffCode, // ignore immutable field
      ...rest
    } = allowedFields;

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

    const normalizedHrId = normalizeObjectIdField(hrId);
    if (hrId !== undefined) {
      if (normalizedHrId) {
        updateData.hrId = normalizedHrId;
      } else {
        unsetData.hrId = '';
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
      .populate('hrId', 'firstName lastName staffCode')
      .populate('department', 'name')
      .populate('team', 'name')
      .populate('practiceAreas', 'name')
      .populate('teamLeadId', 'firstName lastName staffCode')
      .populate('lineManagerId', 'firstName lastName staffCode')
      .populate('hrId', 'firstName lastName staffCode');

    const ensuredDoc = await ensureStaffCode(populatedDoc);

    logAudit('UPDATE_STAFF', {
      user: req.user?.id,
      userEmail: req.user?.email,
      staffId: ensuredDoc._id,
      staffEmail: ensuredDoc.email,
      ip: req.ip,
    });
    res.json(ensuredDoc);
  } catch (err) {
    console.error('❌ Staff update failed:', err);
    res.status(500).json({ error: 'Failed to update staff', details: err.message });
  }
};

// DELETE /api/staff/:id
export const deleteStaff = async (req, res) => {
  try {
    const staffId = String(req.params.id || '').trim();
    if (!isValidObjectId(staffId)) {
      return res.status(400).json({ error: 'Invalid staff id' });
    }

    const deleted = await Staff.findByIdAndDelete(staffId);
    if (!deleted) return res.status(404).json({ error: 'Staff not found' });
    logAudit('DELETE_STAFF', {
      user: req.user?.id,
      userEmail: req.user?.email,
      staffId: deleted._id,
      staffEmail: deleted.email,
      ip: req.ip,
    });
    res.json({ message: 'Staff deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting staff', details: err.message });
  }
};

export const reorderStaff = async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates array is required' });
    }
    await Promise.all(
      updates.map(({ id, displayOrder }) =>
        Staff.findByIdAndUpdate(id, { displayOrder })
      )
    );
    res.json({ message: 'Order saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save order', details: err.message });
  }
};

