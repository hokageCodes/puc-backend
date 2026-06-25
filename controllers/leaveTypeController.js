import LeaveType from '../models/LeaveType.js';
import LeaveRequest from '../models/LeaveRequest.js';
import { logAudit } from '../utils/auditLogger.js';

const GENDERS = ['all', 'male', 'female'];

// Build a clean, normalized payload from the request body.
const buildPayload = (body) => {
  const applicableGender = GENDERS.includes(body.applicableGender) ? body.applicableGender : 'all';
  const allocation = Number(body.defaultDays);

  const payload = {
    name: typeof body.name === 'string' ? body.name.trim() : undefined,
    code: typeof body.code === 'string' ? body.code.trim().toUpperCase() : undefined,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    color: typeof body.color === 'string' ? body.color.trim() : undefined,
    applicableGender,
    isGenderSpecific: applicableGender !== 'all',
    isPaid: body.isPaid !== undefined ? Boolean(body.isPaid) : undefined,
    requiresDocument: body.requiresDocument !== undefined ? Boolean(body.requiresDocument) : undefined,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    minimumNotice: body.minimumNotice !== undefined ? Number(body.minimumNotice) || 0 : undefined,
    maxConsecutiveDays:
      body.maxConsecutiveDays === '' || body.maxConsecutiveDays === null || body.maxConsecutiveDays === undefined
        ? undefined
        : Number(body.maxConsecutiveDays),
  };

  if (!Number.isNaN(allocation)) {
    // defaultDays drives the balance allocation; keep the legacy field in sync.
    payload.defaultDays = allocation;
    payload.defaultAnnualAllocation = allocation;
  }

  // Drop undefined keys so we don't overwrite existing values with undefined on update.
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return payload;
};

// GET /api/leave-types — all types (incl. inactive) for management.
export const adminListLeaveTypes = async (_req, res) => {
  try {
    const types = await LeaveType.find().sort({ name: 1 }).lean();
    res.json(types);
  } catch (err) {
    console.error('adminListLeaveTypes error:', err);
    res.status(500).json({ message: 'Failed to load leave types.' });
  }
};

export const createLeaveType = async (req, res) => {
  try {
    const payload = buildPayload(req.body);
    if (!payload.name) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    const created = await LeaveType.create(payload);
    await logAudit('LEAVE_TYPE_CREATE', { actorId: req.user.id, actorEmail: req.user.email, metadata: { id: created._id.toString(), name: created.name }, req }).catch(() => {});
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A leave type with that name or code already exists.' });
    }
    console.error('createLeaveType error:', err);
    res.status(400).json({ message: err.message || 'Failed to create leave type.' });
  }
};

export const updateLeaveType = async (req, res) => {
  try {
    const payload = buildPayload(req.body);
    const updated = await LeaveType.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!updated) {
      return res.status(404).json({ message: 'Leave type not found.' });
    }
    await logAudit('LEAVE_TYPE_UPDATE', { actorId: req.user.id, actorEmail: req.user.email, metadata: { id: updated._id.toString(), name: updated.name }, req }).catch(() => {});
    res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A leave type with that name or code already exists.' });
    }
    console.error('updateLeaveType error:', err);
    res.status(400).json({ message: err.message || 'Failed to update leave type.' });
  }
};

// DELETE /api/leave-types/:id — hard delete, but refuse if requests reference it
// (deactivate instead to preserve history).
export const deleteLeaveType = async (req, res) => {
  try {
    const inUse = await LeaveRequest.exists({ leaveType: req.params.id });
    if (inUse) {
      return res.status(409).json({
        message: 'This leave type has existing requests and cannot be deleted. Deactivate it instead.',
        code: 'IN_USE',
      });
    }
    const deleted = await LeaveType.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Leave type not found.' });
    }
    await logAudit('LEAVE_TYPE_DELETE', { actorId: req.user.id, actorEmail: req.user.email, metadata: { id: req.params.id, name: deleted.name }, req }).catch(() => {});
    res.json({ message: 'Leave type deleted.' });
  } catch (err) {
    console.error('deleteLeaveType error:', err);
    res.status(500).json({ message: 'Failed to delete leave type.' });
  }
};
