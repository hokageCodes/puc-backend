import mongoose from 'mongoose';
import CourtDiaryEntry from '../models/CourtDiaryEntry.js';
import Staff from '../models/Staff.js';
import { diaryEntriesBaseFilter, isTeamScopedDiaryDepartment } from '../utils/courtDiaryScope.js';
import {
  filterSemanticDuplicates,
  normalizeAppearanceTime,
  teamCalendarRequiresAcknowledgement,
  utcCalendarDayKeyFromDate,
  utcDayRangeFromAppearance,
} from '../utils/diaryDuplicateCheck.js';

const DUPLICATE_MESSAGE =
  'An entry already exists for this date with the same matter reference or the same title and court. Change the details, or confirm you want to add another line.';

const TEAM_CALENDAR_MESSAGE =
  'Your team or department diary already has other court appearances on this date. Review the list below. If this is another real hearing, you can save after confirming.';

const bodyAcknowledgesDuplicate = (body) =>
  body?.acknowledgeDuplicate === true ||
  body?.acknowledgeDuplicate === 'true' ||
  body?.acknowledgeDuplicate === '1';

const bodyAcknowledgesTeamOverlap = (body) =>
  body?.acknowledgeTeamOverlap === true ||
  body?.acknowledgeTeamOverlap === 'true' ||
  body?.acknowledgeTeamOverlap === '1';

const mapConflictRows = (rows) =>
  rows.map((e) => {
    const creator = e.createdBy;
    let createdById = null;
    let createdByDisplayName = 'Another team member';
    if (creator && typeof creator === 'object' && creator._id != null) {
      createdById = String(creator._id);
      const first = String(creator.firstName || '').trim();
      const last = String(creator.lastName || '').trim();
      const full = `${first} ${last}`.trim();
      if (full) createdByDisplayName = full;
    } else if (creator) {
      createdById = String(creator);
    }
    return {
      _id: e._id,
      matterTitle: e.matterTitle,
      matterRef: e.matterRef,
      court: e.court,
      appearanceTime: e.appearanceTime,
      createdById,
      createdByDisplayName,
    };
  });

function calendarDayKeyFromRequest(appearanceDateRaw, appearanceDateObj) {
  const str = String(appearanceDateRaw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return utcCalendarDayKeyFromDate(appearanceDateObj);
}

function hasSameTimeAsOther(othersSameDay, candidateTimeNorm) {
  if (!candidateTimeNorm) return false;
  return othersSameDay.some((e) => normalizeAppearanceTime(e.appearanceTime) === candidateTimeNorm);
}

async function loadSameDayEntriesForScope(staff, appearanceDateRaw, appearanceDateObj, excludeEntryId) {
  const baseFilter = diaryEntriesBaseFilter(staff);
  if (!baseFilter) {
    return { error: { status: 403, message: 'Diary access requires team assignment.' } };
  }
  const range = utcDayRangeFromAppearance(appearanceDateRaw, appearanceDateObj);
  if (!range) {
    return { error: { status: 400, message: 'Valid appearanceDate is required.' } };
  }
  const sameDay = await CourtDiaryEntry.find({
    ...baseFilter,
    appearanceDate: { $gte: range.start, $lte: range.end },
  })
    .select('_id matterTitle matterRef court appearanceTime createdBy')
    .populate('createdBy', 'firstName lastName profilePhoto')
    .lean();
  const ex = excludeEntryId ? String(excludeEntryId) : null;
  const othersSameDay = sameDay.filter((e) => !ex || String(e._id) !== ex);
  return { sameDay, othersSameDay };
}

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
    .populate('department', 'name courtDiaryScope')
    .lean();
  if (!staff) {
    return { error: { status: 404, message: 'Staff profile not found.' } };
  }
  if (isTeamScopedDiaryDepartment(staff.department) && !teamIdFromStaff(staff)) {
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

    const candidateDay = calendarDayKeyFromRequest(appearanceDate, appearanceDateObj);
    const bundle = await loadSameDayEntriesForScope(scope.staff, appearanceDate, appearanceDateObj, null);
    if (bundle.error) {
      return res.status(bundle.error.status).json({ message: bundle.error.message });
    }

    const candidate = {
      matterTitle: normalizeString(matterTitle),
      matterRef: normalizeString(matterRef) || undefined,
      court: normalizeString(court),
    };

    const acknowledgeDup = bodyAcknowledgesDuplicate(req.body);
    if (!acknowledgeDup) {
      const conflicting = filterSemanticDuplicates(bundle.sameDay, candidate, null);
      if (conflicting.length) {
        return res.status(409).json({
          code: 'DIARY_DUPLICATE',
          message: DUPLICATE_MESSAGE,
          conflicts: mapConflictRows(conflicting),
        });
      }
    }

    const acknowledgeTeam = bodyAcknowledgesTeamOverlap(req.body);
    if (!acknowledgeTeam) {
      const candTimeNorm = normalizeAppearanceTime(normalizeString(appearanceTime));
      const needTeam = teamCalendarRequiresAcknowledgement({
        mode: 'create',
        othersSameDay: bundle.othersSameDay,
        candidateTimeNorm: candTimeNorm,
        candidateDay: candidateDay,
        baselineDay: '',
        baselineTimeNorm: null,
      });
      if (needTeam) {
        const sameTimeConflict = hasSameTimeAsOther(bundle.othersSameDay, candTimeNorm);
        let message = TEAM_CALENDAR_MESSAGE;
        if (sameTimeConflict && candTimeNorm) {
          message += ` Another entry is already at ${candTimeNorm} (same clock time).`;
        }
        return res.status(409).json({
          code: 'DIARY_TEAM_CALENDAR',
          message,
          conflicts: mapConflictRows(bundle.othersSameDay),
          sameTimeConflict,
        });
      }
    }

    const nextHearingDateObj = nextHearingDate ? new Date(nextHearingDate) : null;
    if (nextHearingDate && Number.isNaN(nextHearingDateObj?.getTime())) {
      return res.status(400).json({ message: 'nextHearingDate must be a valid date.' });
    }

    const tid = teamIdFromStaff(scope.staff);
    const teamDiaryDept = isTeamScopedDiaryDepartment(scope.staff.department);
    const entry = await CourtDiaryEntry.create({
      team: teamDiaryDept ? tid : tid || undefined,
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
      .populate('createdBy', 'firstName lastName email profilePhoto')
      .populate('updatedBy', 'firstName lastName email profilePhoto')
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
    const baseFilter = diaryEntriesBaseFilter(scope.staff);
    if (!baseFilter) {
      return res.status(403).json({ message: 'Diary access requires team assignment.' });
    }
    const filter = { ...baseFilter };
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
      .populate('createdBy', 'firstName lastName email profilePhoto')
      .populate('updatedBy', 'firstName lastName email profilePhoto')
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

    const baseFilter = diaryEntriesBaseFilter(scope.staff);
    if (!baseFilter) {
      return res.status(403).json({ message: 'Diary access requires team assignment.' });
    }
    const entry = await CourtDiaryEntry.findOne({ _id: entryId, ...baseFilter })
      .populate('team', 'name')
      .populate('department', 'name')
      .populate('createdBy', 'firstName lastName email profilePhoto')
      .populate('updatedBy', 'firstName lastName email profilePhoto')
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

    const baseFilter = diaryEntriesBaseFilter(scope.staff);
    if (!baseFilter) {
      return res.status(403).json({ message: 'Diary access requires team assignment.' });
    }
    const entryFilter = { _id: entryId, ...baseFilter };
    const existing = await CourtDiaryEntry.findOne(entryFilter)
      .select('_id matterTitle matterRef court appearanceDate appearanceTime')
      .lean();
    if (!existing) {
      return res.status(404).json({ message: 'Diary entry not found.' });
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

    const mergedTitle =
      req.body?.matterTitle !== undefined ? normalizeString(req.body.matterTitle) : existing.matterTitle;
    const mergedRef =
      req.body?.matterRef !== undefined ? normalizeString(req.body.matterRef) || undefined : existing.matterRef;
    const mergedCourt = req.body?.court !== undefined ? normalizeString(req.body.court) : existing.court;
    let mergedAppearanceDateObj = existing.appearanceDate;
    let appearanceDateRawForRange;
    if (req.body?.appearanceDate !== undefined) {
      const d = patch.appearanceDate;
      mergedAppearanceDateObj = d;
      appearanceDateRawForRange =
        typeof req.body.appearanceDate === 'string'
          ? req.body.appearanceDate
          : d instanceof Date && !Number.isNaN(d.getTime())
            ? d.toISOString().slice(0, 10)
            : String(req.body.appearanceDate);
    } else if (existing.appearanceDate) {
      mergedAppearanceDateObj = existing.appearanceDate;
      const ex = existing.appearanceDate;
      appearanceDateRawForRange =
        ex instanceof Date && !Number.isNaN(ex.getTime()) ? ex.toISOString().slice(0, 10) : String(ex);
    } else {
      appearanceDateRawForRange = '';
    }

    const bundle = await loadSameDayEntriesForScope(
      scope.staff,
      appearanceDateRawForRange,
      mergedAppearanceDateObj,
      String(entryId)
    );
    if (bundle.error) {
      return res.status(bundle.error.status).json({ message: bundle.error.message });
    }

    const acknowledgeDup = bodyAcknowledgesDuplicate(req.body);
    if (!acknowledgeDup) {
      const candidate = {
        matterTitle: mergedTitle,
        matterRef: mergedRef,
        court: mergedCourt,
      };
      const conflicting = filterSemanticDuplicates(bundle.sameDay, candidate, String(entryId));
      if (conflicting.length) {
        return res.status(409).json({
          code: 'DIARY_DUPLICATE',
          message: DUPLICATE_MESSAGE,
          conflicts: mapConflictRows(conflicting),
        });
      }
    }

    const acknowledgeTeam = bodyAcknowledgesTeamOverlap(req.body);
    if (!acknowledgeTeam) {
      const candDayRaw = calendarDayKeyFromRequest(appearanceDateRawForRange, mergedAppearanceDateObj);
      const baselineDay = utcCalendarDayKeyFromDate(existing.appearanceDate);
      const baselineTimeNorm = normalizeAppearanceTime(existing.appearanceTime);
      const candTimeNorm = normalizeAppearanceTime(
        req.body?.appearanceTime !== undefined ? req.body.appearanceTime : existing.appearanceTime
      );

      const needTeam = teamCalendarRequiresAcknowledgement({
        mode: 'update',
        othersSameDay: bundle.othersSameDay,
        candidateTimeNorm: candTimeNorm,
        candidateDay: candDayRaw,
        baselineDay,
        baselineTimeNorm,
      });
      if (needTeam) {
        const sameTimeConflict = hasSameTimeAsOther(bundle.othersSameDay, candTimeNorm);
        let message = TEAM_CALENDAR_MESSAGE;
        if (sameTimeConflict && candTimeNorm) {
          message += ` Another entry is already at ${candTimeNorm} (same clock time).`;
        }
        return res.status(409).json({
          code: 'DIARY_TEAM_CALENDAR',
          message,
          conflicts: mapConflictRows(bundle.othersSameDay),
          sameTimeConflict,
        });
      }
    }

    const updateDoc = { $set: patch };
    if (unsetNextHearingDate) {
      updateDoc.$unset = { nextHearingDate: '' };
    }

    const entry = await CourtDiaryEntry.findOneAndUpdate(
      entryFilter,
      updateDoc,
      { new: true, runValidators: true }
    )
      .populate('team', 'name')
      .populate('department', 'name')
      .populate('createdBy', 'firstName lastName email profilePhoto')
      .populate('updatedBy', 'firstName lastName email profilePhoto')
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

    const baseFilter = diaryEntriesBaseFilter(scope.staff);
    if (!baseFilter) {
      return res.status(403).json({ message: 'Diary access requires team assignment.' });
    }
    const deleted = await CourtDiaryEntry.findOneAndDelete({ _id: entryId, ...baseFilter }).lean();
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

    const baseFilter = diaryEntriesBaseFilter(scope.staff);
    if (!baseFilter) {
      return res.status(403).json({ message: 'Diary access requires team assignment.' });
    }
    const teamId = teamIdFromStaff(scope.staff);
    const conflicts = await CourtDiaryEntry.find({
      ...baseFilter,
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

export const getDiaryConflictsPreview = async (req, res) => {
  try {
    const scope = await resolveRequesterScope(req.user.id);
    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const {
      appearanceDate,
      appearanceTime,
      court,
      matterTitle,
      matterRef,
      excludeEntryId,
      baselineAppearanceDate,
      baselineAppearanceTime,
    } = req.query || {};

    if (!appearanceDate) {
      return res.status(400).json({ message: 'appearanceDate is required.' });
    }

    const appearanceDateObj = new Date(appearanceDate);
    if (Number.isNaN(appearanceDateObj.getTime())) {
      return res.status(400).json({ message: 'Valid appearanceDate is required.' });
    }

    const excludeOid = ensureObjectId(excludeEntryId);
    const excludeForFilter = excludeOid ? String(excludeOid) : null;

    const bundle = await loadSameDayEntriesForScope(
      scope.staff,
      appearanceDate,
      appearanceDateObj,
      excludeForFilter
    );
    if (bundle.error) {
      return res.status(bundle.error.status).json({ message: bundle.error.message });
    }

    const candDayRaw = calendarDayKeyFromRequest(appearanceDate, appearanceDateObj);
    const candTimeNorm = normalizeAppearanceTime(normalizeString(appearanceTime));

    let semanticConflicts = [];
    if (normalizeString(matterTitle) && normalizeString(court)) {
      const candidate = {
        matterTitle: normalizeString(matterTitle),
        matterRef: normalizeString(matterRef) || undefined,
        court: normalizeString(court),
      };
      semanticConflicts = filterSemanticDuplicates(bundle.sameDay, candidate, excludeForFilter);
    }

    const baselineDay = normalizeString(baselineAppearanceDate) || '';
    const baselineTimeNorm = normalizeAppearanceTime(normalizeString(baselineAppearanceTime));

    const previewMode = excludeForFilter ? 'update' : 'create';
    const effBaselineDay = previewMode === 'update' ? baselineDay || candDayRaw : '';

    let effBaselineTime = null;
    if (previewMode === 'update') {
      if (req.query.baselineAppearanceTime !== undefined) {
        effBaselineTime = baselineTimeNorm;
      } else if (baselineDay) {
        effBaselineTime = baselineTimeNorm;
      } else {
        effBaselineTime = candTimeNorm;
      }
    }

    const requiresTeamAck = teamCalendarRequiresAcknowledgement({
      mode: previewMode,
      othersSameDay: bundle.othersSameDay,
      candidateTimeNorm: candTimeNorm,
      candidateDay: candDayRaw,
      baselineDay: previewMode === 'update' ? effBaselineDay : '',
      baselineTimeNorm: previewMode === 'update' ? effBaselineTime : null,
    });

    const teamSameTimeEntries = candTimeNorm
      ? bundle.othersSameDay.filter((e) => normalizeAppearanceTime(e.appearanceTime) === candTimeNorm)
      : [];

    return res.json({
      semanticConflicts: mapConflictRows(semanticConflicts),
      teamSameDayEntries: mapConflictRows(bundle.othersSameDay),
      teamSameTimeEntries: mapConflictRows(teamSameTimeEntries),
      teamCalendarRequiresAck: requiresTeamAck,
    });
  } catch (error) {
    console.error('getDiaryConflictsPreview error:', error);
    return res.status(500).json({ message: 'Failed to preview conflicts.' });
  }
};
