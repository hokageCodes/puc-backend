import mongoose from 'mongoose';
import LeaveType from '../models/LeaveType.js';
import LeaveBalance from '../models/LeaveBalance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Staff from '../models/Staff.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const currentPeriod = (date = new Date()) => date.getUTCFullYear();

const calculateDurationDays = (startDate, endDate, halfDay) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid start or end date');
  }

  if (start > end) {
    throw new Error('Start date must be before end date');
  }

  const diff = Math.floor((end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0)) / MS_PER_DAY) + 1;
  const base = Math.max(diff, 1);

  if (halfDay === 'first' || halfDay === 'second') {
    return Math.max(base - 0.5, 0.5);
  }

  return base;
};

const ensureLeaveBalance = async (staffId, leaveType, period) => {
  const defaultAllocation =
    typeof leaveType.defaultDays === 'number'
      ? leaveType.defaultDays
      : leaveType.defaultAnnualAllocation ?? 0;

  const balance = await LeaveBalance.findOneAndUpdate(
    { staff: staffId, leaveType: leaveType._id, period },
    {
      $setOnInsert: {
        allocated: defaultAllocation,
        carriedOver: 0,
        used: 0,
        pending: 0,
      },
    },
    { new: true, upsert: true }
  );

  return balance;
};

const adjustBalancePending = async ({ staffId, leaveTypeId, period, amount }) => {
  await LeaveBalance.updateOne(
    { staff: staffId, leaveType: leaveTypeId, period },
    { $inc: { pending: amount } }
  );
};

const adjustBalanceOnFinalApproval = async ({ staffId, leaveTypeId, period, duration }) => {
  await LeaveBalance.updateOne(
    { staff: staffId, leaveType: leaveTypeId, period },
    {
      $inc: {
        pending: -duration,
        used: duration,
      },
    }
  );
};

const adjustBalanceOnRejection = async ({ staffId, leaveTypeId, period, duration }) => {
  await LeaveBalance.updateOne(
    { staff: staffId, leaveType: leaveTypeId, period },
    { $inc: { pending: -duration } }
  );
};

const buildApproverChain = (staffDoc) => {
  const chain = [];

  if (staffDoc.teamLeadId) {
    chain.push({ role: 'teamLead', assignee: staffDoc.teamLeadId });
  }

  if (staffDoc.lineManagerId) {
    chain.push({ role: 'lineManager', assignee: staffDoc.lineManagerId });
  }

  // HR final approval (general queue)
  chain.push({ role: 'hr' });

  return chain.map((step) => ({ ...step, status: 'pending' }));
};

const deriveStatusFromChain = (chain) => {
  const next = chain.find((step) => step.status === 'pending');
  if (!next) {
    return 'approved';
  }
  return `pending_${next.role}`;
};

const appendTimeline = (request, event, actorId, note) => {
  request.timeline.push({ event, actor: actorId, timestamp: new Date(), note });
};

export const listLeaveTypes = async (req, res) => {
  const types = await LeaveType.find({ isActive: true }).sort({ name: 1 }).lean();
  res.json(types);
};

export const getMyBalances = async (req, res) => {
  const period = currentPeriod();
  const staffId = req.user.id;
  const types = await LeaveType.find({ isActive: true }).lean();

  const balances = await Promise.all(
    types.map(async (type) => {
      const balance = await ensureLeaveBalance(staffId, type, period);
      return {
        type: {
          id: type._id,
          name: type.name,
          code: type.code,
        },
        period: balance.period,
        allocated: balance.allocated,
        carriedOver: balance.carriedOver,
        used: balance.used,
        pending: balance.pending,
        remaining: balance.allocated + balance.carriedOver - balance.used - balance.pending,
      };
    })
  );

  res.json(balances);
};

export const createLeaveRequest = async (req, res) => {
  try {
    const { leaveTypeId, startDate, endDate, halfDay, coveragePlan, handoverNotes, reason } = req.body;

    if (!leaveTypeId || !startDate || !endDate || !reason) {
      return res.status(400).json({ message: 'Leave type, dates, and reason are required.' });
    }

    const leaveType = await LeaveType.findById(leaveTypeId);
    if (!leaveType || !leaveType.isActive) {
      return res.status(404).json({ message: 'Leave type not found.' });
    }

    const staff = await Staff.findById(req.user.id).populate('teamLeadId lineManagerId');
    if (!staff) {
      return res.status(404).json({ message: 'Staff profile not found.' });
    }

    const durationDays = calculateDurationDays(startDate, endDate, halfDay);
    const period = currentPeriod(new Date(startDate));

    await ensureLeaveBalance(staff._id, leaveType, period);
    await adjustBalancePending({
      staffId: staff._id,
      leaveTypeId: leaveType._id,
      period,
      amount: durationDays,
    });

    const approverChain = buildApproverChain(staff).map((step, index) =>
      index === 0 ? step : step
    );
    const status = deriveStatusFromChain(approverChain);

    const leaveRequest = new LeaveRequest({
      staff: staff._id,
      leaveType: leaveType._id,
      startDate,
      endDate,
      durationDays,
      halfDay: halfDay || undefined,
      coveragePlan: coveragePlan || undefined,
      handoverNotes: handoverNotes || undefined,
      reason: reason.trim(),
      approverChain,
      status,
      createdBy: req.user.id,
    });

    appendTimeline(leaveRequest, 'submitted', req.user.id, undefined);

    await leaveRequest.save();
    await leaveRequest.populate([ { path: 'leaveType', select: 'name code' } ]);

    res.status(201).json(leaveRequest);
  } catch (error) {
    console.error('Create leave request error:', error);
    res.status(400).json({ message: error.message || 'Unable to create leave request.' });
  }
};

export const getMyRequests = async (req, res) => {
  const requests = await LeaveRequest.find({ staff: req.user.id })
    .populate('leaveType', 'name code')
    .sort({ createdAt: -1 })
    .lean();
  res.json(requests);
};

const buildApproverMatchConditions = (user) => {
  const conditions = [];
  const roles = new Set(user.roles || []);

  if (roles.has('teamLead')) {
    conditions.push({
      status: 'pending_teamlead',
      approverChain: {
        $elemMatch: {
          role: 'teamLead',
          status: 'pending',
          assignee: new mongoose.Types.ObjectId(user.id),
        },
      },
    });
  }

  if (roles.has('lineManager')) {
    conditions.push({
      status: 'pending_linemanager',
      approverChain: {
        $elemMatch: {
          role: 'lineManager',
          status: 'pending',
          assignee: new mongoose.Types.ObjectId(user.id),
        },
      },
    });
  }

  if (roles.has('hr')) {
    conditions.push({
      status: 'pending_hr',
      approverChain: {
        $elemMatch: {
          role: 'hr',
          status: 'pending',
        },
      },
    });
  }

  return conditions;
};

export const getPendingApprovals = async (req, res) => {
  const matchConditions = buildApproverMatchConditions(req.user);

  if (matchConditions.length === 0) {
    return res.json([]);
  }

  const requests = await LeaveRequest.find({ $or: matchConditions })
    .populate('staff', 'firstName lastName staffCode division')
    .populate('leaveType', 'name code')
    .sort({ startDate: 1 })
    .lean();

  res.json(requests);
};

const findCurrentPendingStep = (request) => {
  if (!request.status.startsWith('pending_')) return null;
  const role = request.status.replace('pending_', '');
  return request.approverChain.find((step) => step.role === role && step.status === 'pending');
};

const userCanActOnStep = (step, user) => {
  if (!step) return false;
  if (step.assignee) {
    return step.assignee.toString() === user.id;
  }
  // HR steps may not have a direct assignee; require hr role
  return (user.roles || []).includes(step.role);
};

export const approveLeaveRequest = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body || {};

  const leaveRequest = await LeaveRequest.findById(id);
  if (!leaveRequest) {
    return res.status(404).json({ message: 'Leave request not found.' });
  }

  const step = findCurrentPendingStep(leaveRequest);
  if (!userCanActOnStep(step, req.user)) {
    return res.status(403).json({ message: 'You are not authorised to approve this request.' });
  }

  step.status = 'approved';
  step.actedAt = new Date();
  step.comment = comment || undefined;
  leaveRequest.updatedBy = req.user.id;

  appendTimeline(leaveRequest, 'approved', req.user.id, comment);

  const remaining = leaveRequest.approverChain.find((s) => s.status === 'pending');
  if (remaining) {
    leaveRequest.status = `pending_${remaining.role}`;
  } else {
    leaveRequest.status = 'approved';
    const period = currentPeriod(leaveRequest.startDate);
    await adjustBalanceOnFinalApproval({
      staffId: leaveRequest.staff,
      leaveTypeId: leaveRequest.leaveType,
      period,
      duration: leaveRequest.durationDays,
    });
  }

  await leaveRequest.save();
  await leaveRequest.populate(['leaveType', 'staff']);

  res.json(leaveRequest);
};

export const rejectLeaveRequest = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body || {};

  const leaveRequest = await LeaveRequest.findById(id);
  if (!leaveRequest) {
    return res.status(404).json({ message: 'Leave request not found.' });
  }

  const step = findCurrentPendingStep(leaveRequest);
  if (!userCanActOnStep(step, req.user)) {
    return res.status(403).json({ message: 'You are not authorised to reject this request.' });
  }

  step.status = 'rejected';
  step.actedAt = new Date();
  step.comment = comment || undefined;
  leaveRequest.status = 'rejected';
  leaveRequest.updatedBy = req.user.id;

  appendTimeline(leaveRequest, 'rejected', req.user.id, comment);

  const period = currentPeriod(leaveRequest.startDate);
  await adjustBalanceOnRejection({
    staffId: leaveRequest.staff,
    leaveTypeId: leaveRequest.leaveType,
    period,
    duration: leaveRequest.durationDays,
  });

  await leaveRequest.save();
  await leaveRequest.populate(['leaveType', 'staff']);

  res.json(leaveRequest);
};

export const getCalendarData = async (req, res) => {
  const userId = req.user.id;
  const userRoles = new Set(req.user.roles || []);
  const isApprover = userRoles.has('teamLead') || userRoles.has('lineManager') || userRoles.has('hr');

  // Always get user's own requests
  const myRequests = await LeaveRequest.find({ staff: userId })
    .populate('leaveType', 'name code')
    .populate('staff', 'firstName lastName')
    .sort({ startDate: 1 })
    .lean();

  const events = myRequests
    .filter((req) => req.leaveType) // Filter out requests without leaveType
    .map((req) => ({
      id: req._id.toString(),
      title: `Your ${req.leaveType?.name || 'Leave'}`,
      startDate: req.startDate,
      endDate: req.endDate,
      type: 'own',
      status: req.status,
      leaveType: req.leaveType?.name || 'Leave',
      colour: 'bg-emerald-100 text-emerald-700',
    }));

  // If user is an approver, get team requests
  if (isApprover) {
    const staff = await Staff.findById(userId);
    if (staff) {
      const teamConditions = [];

      // Team Lead: get requests from staff where this user is teamLeadId
      if (userRoles.has('teamLead')) {
        teamConditions.push({ teamLeadId: userId });
      }

      // Line Manager: get requests from staff where this user is lineManagerId
      if (userRoles.has('lineManager')) {
        teamConditions.push({ lineManagerId: userId });
      }

      // HR: get all approved/pending requests (they see everything)
      if (userRoles.has('hr')) {
        const teamRequests = await LeaveRequest.find({
          staff: { $ne: userId }, // Exclude own requests (already added)
          status: { $in: ['approved', 'pending_teamlead', 'pending_linemanager', 'pending_hr'] },
        })
          .populate('leaveType', 'name code')
          .populate('staff', 'firstName lastName')
          .sort({ startDate: 1 })
          .lean();

        teamRequests
          .filter((req) => req.leaveType && req.staff) // Filter out incomplete data
          .forEach((req) => {
            const staffName = `${req.staff?.firstName || ''} ${req.staff?.lastName || ''}`.trim();
            events.push({
              id: req._id.toString(),
              title: `${staffName} • ${req.leaveType?.name || 'Leave'}`,
              startDate: req.startDate,
              endDate: req.endDate,
              type: 'team',
              status: req.status,
              leaveType: req.leaveType?.name || 'Leave',
              staffName,
              colour: 'bg-blue-100 text-blue-700',
            });
          });
      } else if (teamConditions.length > 0) {
        // For team leads and line managers, get requests from their direct reports
        const teamStaff = await Staff.find({ $or: teamConditions }).select('_id').lean();
        const teamStaffIds = teamStaff.map((s) => s._id);

        if (teamStaffIds.length > 0) {
          const teamRequests = await LeaveRequest.find({
            staff: { $in: teamStaffIds },
            status: { $in: ['approved', 'pending_teamlead', 'pending_linemanager', 'pending_hr'] },
          })
            .populate('leaveType', 'name code')
            .populate('staff', 'firstName lastName')
            .sort({ startDate: 1 })
            .lean();

          teamRequests
            .filter((req) => req.leaveType && req.staff) // Filter out incomplete data
            .forEach((req) => {
              const staffName = `${req.staff?.firstName || ''} ${req.staff?.lastName || ''}`.trim();
              events.push({
                id: req._id.toString(),
                title: `${staffName} • ${req.leaveType?.name || 'Leave'}`,
                startDate: req.startDate,
                endDate: req.endDate,
                type: 'team',
                status: req.status,
                leaveType: req.leaveType?.name || 'Leave',
                staffName,
                colour: 'bg-blue-100 text-blue-700',
              });
            });
        }
      }
    }
  }

  res.json({ events });
};