import mongoose from 'mongoose';
import CourtDiaryEntry from '../models/CourtDiaryEntry.js';
import Staff from '../models/Staff.js';

const parsePagination = (query, defaultLimit = 50) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 200);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const ensureObjectId = (value) => {
  const raw = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(raw) ? new mongoose.Types.ObjectId(raw) : null;
};

const buildDateRangeFilter = (query) => {
  const dateFilter = {};
  if (query.from) {
    const fromDate = new Date(query.from);
    if (!Number.isNaN(fromDate.getTime())) {
      dateFilter.$gte = fromDate;
    }
  }
  if (query.to) {
    const toDate = new Date(query.to);
    if (!Number.isNaN(toDate.getTime())) {
      dateFilter.$lte = toDate;
    }
  }
  return Object.keys(dateFilter).length > 0 ? dateFilter : null;
};

const teamIdFromStaff = (staff) => staff?.team?._id || staff?.team || null;
const departmentIdFromStaff = (staff) => staff?.department?._id || staff?.department || null;

const resolveRequesterScope = async (userId) => {
  const staff = await Staff.findById(userId)
    .select('_id team department')
    .populate('team', 'name')
    .populate('department', 'name')
    .lean();
  if (!staff) {
    return { error: { status: 404, message: 'Staff profile not found.' } };
  }
  if (!staff.team) {
    return { error: { status: 403, message: 'Diary access requires team assignment.' } };
  }
  return { staff };
};

export const createDiaryEntry = async (req, res) => {
  try {
    const scope = await resolveRequesterScope(req.user.id);
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const {
      matterTitle,
      matterRef,
      court,
      appearanceDate,
      appearanceTime,
      nextHearingDate,
      notes,
      status,
    } = req.body || {};

    const appearanceDateObj = new Date(appearanceDate);
    if (Number.isNaN(appearanceDateObj.getTime())) {
      return res.status(400).json({ message: 'Valid appearanceDate is required.' });
    }

    const nextHearingDateObj = nextHearingDate ? new Date(nextHearingDate) : null;
    if (nextHearingDate && Number.isNaN(nextHearingDateObj?.getTime())) {
      return res.status(400).json({ message: 'nextHearingDate must be a valid date.' });
    }

    const entry = await CourtDiaryEntry.create({
      team: teamIdFromStaff(scope.staff),
      department: departmentIdFromStaff(scope.staff) || undefined,
      matterTitle: normalizeString(matterTitle),
      matterRef: normalizeString(matterRef) || undefined,
      court: normalizeString(court),
      appearanceDate: appearanceDateObj,
      appearanceTime: normalizeString(appearanceTime) || undefined,
      nextHearingDate: nextHearingDateObj || undefined,
      notes: normalizeString(notes) || undefined,
      status: normalizeString(status) || undefined,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    const populated = await CourtDiaryEntry.findById(entry._id)
      .populate('team', 'name')
      .populate('department', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .lean();

    return res.status(201).json(populated);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: Object.values(error.errors).map((e) => e.message).join(', ') });
    }
    console.error('createDiaryEntry error:', error);
    return res.status(500).json({ message: 'Failed to create diary entry.' });
  }
};

export const listDiaryEntries = async (req, res) => {
  try {
    const scope = await resolveRequesterScope(req.user.id);
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const teamId = teamIdFromStaff(scope.staff);
    const filter = { team: teamId };
    const dateFilter = buildDateRangeFilter(req.query);

    if (dateFilter) {
      filter.appearanceDate = dateFilter;
    }
    if (req.query.status) {
      filter.status = normalizeString(req.query.status);
    }
    if (req.query.matter) {
      const needle = normalizeString(req.query.matter);
      filter.$or = [
        { matterTitle: { $regex: needle, $options: 'i' } },
        { matterRef: { $regex: needle, $options: 'i' } },
        { court: { $regex: needle, $options: 'i' } },
      ];
    }

    const [entries, total] = await Promise.all([
      CourtDiaryEntry.find(filter)
        .populate('team', 'name')
        .populate('department', 'name')
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .sort({ appearanceDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CourtDiaryEntry.countDocuments(filter),
    ]);

    res.set('X-Total-Count', String(total));
    res.set('X-Total-Pages', String(Math.ceil(total / limit)));
    res.set('X-Page', String(page));
    res.set('X-Limit', String(limit));
    return res.json({
      team: scope.staff.team
        ? {
            id: scope.staff.team?._id || scope.staff.team,
            name: scope.staff.team?.name || null,
          }
        : null,
      department: scope.staff.department
        ? {
            id: scope.staff.department?._id || scope.staff.department,
            name: scope.staff.department?.name || null,
          }
        : null,
      entries,
    });
  } catch (error) {
    console.error('listDiaryEntries error:', error);
    return res.status(500).json({ message: 'Failed to load diary entries.' });
  }
};

export const getDiaryEntry = async (req, res) => {
  try {
    const scope = await resolveRequesterScope(req.user.id);
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const entryId = ensureObjectId(req.params.id);
    if (!entryId) {
      return res.status(400).json({ message: 'Invalid diary entry id.' });
    }

    const teamId = teamIdFromStaff(scope.staff);
    const entry = await CourtDiaryEntry.findOne({ _id: entryId, team: teamId })
      .populate('team', 'name')
      .populate('department', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .lean();

    if (!entry) {
      return res.status(404).json({ message: 'Diary entry not found.' });
    }

    return res.json(entry);
  } catch (error) {
    console.error('getDiaryEntry error:', error);
    return res.status(500).json({ message: 'Failed to load diary entry.' });
  }
};

export const updateDiaryEntry = async (req, res) => {
  try {
    const scope = await resolveRequesterScope(req.user.id);
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const entryId = ensureObjectId(req.params.id);
    if (!entryId) {
      return res.status(400).json({ message: 'Invalid diary entry id.' });
    }

    const patch = {};
    const setIfPresent = (key, transform = (v) => v) => {
      if (req.body?.[key] !== undefined) {
        patch[key] = transform(req.body[key]);
      }
    };

    setIfPresent('matterTitle', (v) => normalizeString(v));
    setIfPresent('matterRef', (v) => normalizeString(v) || undefined);
    setIfPresent('court', (v) => normalizeString(v));
    setIfPresent('appearanceTime', (v) => normalizeString(v) || undefined);
    setIfPresent('notes', (v) => normalizeString(v) || undefined);
    setIfPresent('status', (v) => normalizeString(v));
    setIfPresent('appearanceDate', (v) => {
      const date = new Date(v);
      if (Number.isNaN(date.getTime())) throw new Error('INVALID_APPEARANCE_DATE');
      return date;
    });

    let unsetNextHearingDate = false;
    if (req.body?.nextHearingDate !== undefined) {
      const v = req.body.nextHearingDate;
      if (v === null || v === '') {
        unsetNextHearingDate = true;
      } else {
        const date = new Date(v);
        if (Number.isNaN(date.getTime())) throw new Error('INVALID_NEXT_HEARING_DATE');
        patch.nextHearingDate = date;
      }
    }

    patch.updatedBy = req.user.id;

    const updateDoc = { $set: patch };
    if (unsetNextHearingDate) {
      updateDoc.$unset = { nextHearingDate: '' };
    }

    const teamId = teamIdFromStaff(scope.staff);
    const entry = await CourtDiaryEntry.findOneAndUpdate(
      { _id: entryId, team: teamId },
      updateDoc,
      { new: true, runValidators: true }
    )
      .populate('team', 'name')
      .populate('department', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .lean();

    if (!entry) {
      return res.status(404).json({ message: 'Diary entry not found.' });
    }
    return res.json(entry);
  } catch (error) {
    if (error.message === 'INVALID_APPEARANCE_DATE') {
      return res.status(400).json({ message: 'appearanceDate must be a valid date.' });
    }
    if (error.message === 'INVALID_NEXT_HEARING_DATE') {
      return res.status(400).json({ message: 'nextHearingDate must be a valid date.' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: Object.values(error.errors).map((e) => e.message).join(', ') });
    }
    console.error('updateDiaryEntry error:', error);
    return res.status(500).json({ message: 'Failed to update diary entry.' });
  }
};

export const deleteDiaryEntry = async (req, res) => {
  try {
    const scope = await resolveRequesterScope(req.user.id);
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const entryId = ensureObjectId(req.params.id);
    if (!entryId) {
      return res.status(400).json({ message: 'Invalid diary entry id.' });
    }

    const teamId = teamIdFromStaff(scope.staff);
    const deleted = await CourtDiaryEntry.findOneAndDelete({ _id: entryId, team: teamId }).lean();
    if (!deleted) {
      return res.status(404).json({ message: 'Diary entry not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('deleteDiaryEntry error:', error);
    return res.status(500).json({ message: 'Failed to delete diary entry.' });
  }
};

export const getDiaryAvailability = async (req, res) => {
  try {
    const scope = await resolveRequesterScope(req.user.id);
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const date = new Date(req.query.date);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Valid date query parameter is required.' });
    }
    const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

    const teamId = teamIdFromStaff(scope.staff);
    const conflicts = await CourtDiaryEntry.find({
      team: teamId,
      appearanceDate: { $gte: dayStart, $lte: dayEnd },
    })
      .select('matterTitle matterRef court appearanceDate appearanceTime status')
      .sort({ appearanceDate: 1 })
      .lean();

    return res.json({
      date: dayStart,
      team: scope.staff.team
        ? {
            id: scope.staff.team?._id || scope.staff.team,
            name: scope.staff.team?.name || null,
          }
        : teamId
          ? { id: teamId, name: null }
          : null,
      isAvailable: conflicts.length === 0,
      conflicts,
    });
  } catch (error) {
    console.error('getDiaryAvailability error:', error);
    return res.status(500).json({ message: 'Failed to load diary availability.' });
  }
};
