import mongoose from 'mongoose';
import LeaveType from '../models/LeaveType.js';
import LeaveBalance from '../models/LeaveBalance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Staff from '../models/Staff.js';
import { sendEmail } from '../utils/email.js';
import {
  buildLeaveRequestNotificationEmail,
  buildLeaveApprovedEmail,
  buildLeaveRejectedEmail,
} from '../utils/email.js';

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

// NOTE: Business change — do not reserve days at request creation. Only
// adjust (deduct) leave balances when a request is finally approved.
// Therefore we no longer touch the `pending` field when creating/rejecting requests.
const adjustBalancePending = async ({ staffId, leaveTypeId, period, amount }) => {
  // Deprecated: reservation behaviour removed. Keep function for compatibility but no-op.
  return;
};

const adjustBalanceOnFinalApproval = async ({ staffId, leaveTypeId, period, duration }) => {
  // On final approval, increment used days. Do not touch pending (we no longer reserve at request creation).
  await LeaveBalance.updateOne(
    { staff: staffId, leaveType: leaveTypeId, period },
    {
      $inc: {
        used: duration,
      },
    }
  );
};

const adjustBalanceOnRejection = async ({ staffId, leaveTypeId, period, duration }) => {
  // No-op: since we don't reserve pending days at creation, nothing to revert on rejection.
  return;
};

/**
 * Builds the approval chain for a leave request based on staff's reporting structure.
 * Chain order: Team Lead → Line Manager → HR (all must be assigned)
 * 
 * @param {Object} staffDoc - Staff document with teamLeadId, lineManagerId, and hrId
 * @returns {Array} Array of approval steps with role, assignee, and status
 */
const buildApproverChain = (staffDoc) => {
  const chain = [];

  const resolveId = (val) => {
    if (!val) return null;
    // If populated document, return its _id, otherwise return the value (assumed ObjectId/string)
    if (typeof val === 'object' && val._id) return val._id;
    return val;
  };

  // Step 1: Team Lead approval (required)
  const tl = resolveId(staffDoc.teamLeadId);
  if (tl) {
    chain.push({ role: 'teamLead', assignee: tl });
  }

  // Step 2: Line Manager approval (required)
  const lm = resolveId(staffDoc.lineManagerId);
  if (lm) {
    chain.push({ role: 'lineManager', assignee: lm });
  }

  // Step 3: HR final approval (required - specific HR person assigned to staff)
  const hr = resolveId(staffDoc.hrId);
  // Always include an HR approval step so the workflow consistently ends at HR.
  // If a specific HR assignee is configured, attach them; otherwise leave assignee null
  // and fallback to notifying all HRs when notifying or listing pending approvals.
  chain.push({ role: 'hr', assignee: hr || null });

  // Initialize all steps as pending
  return chain.map((step) => ({ ...step, status: 'pending' }));
};

const deriveStatusFromChain = (chain) => {
  const next = chain.find((step) => step.status === 'pending');
  if (!next) {
    return 'approved';
  }
  // Convert role to lowercase for status (teamLead -> teamlead, lineManager -> linemanager)
  const roleForStatus = next.role.toLowerCase();
  return `pending_${roleForStatus}`;
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
        // With reservation removed, remaining is calculated from allocated + carriedOver - used
        remaining: balance.allocated + balance.carriedOver - balance.used,
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

    const staff = await Staff.findById(req.user.id).populate('teamLeadId lineManagerId hrId');
    if (!staff) {
      return res.status(404).json({ message: 'Staff profile not found.' });
    }

    const durationDays = calculateDurationDays(startDate, endDate, halfDay);
    const period = currentPeriod(new Date(startDate));

    // Ensure balance document exists. We do NOT reserve days at creation anymore.
    await ensureLeaveBalance(staff._id, leaveType, period);

    const approverChain = buildApproverChain(staff);
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
  console.log(`💾 Leave request saved: id=${leaveRequest._id} staff=${staff._id} duration=${durationDays}`);

    // Send email notification to first approver
    try {
      const firstApprover = approverChain.find((step) => step.status === 'pending');
      if (firstApprover) {
        // If the step has a specific assignee, notify them. Otherwise, if it's an HR step without an assignee,
        // notify all users with the 'hr' role so the request reaches HR.
        if (firstApprover.assignee) {
          const approver = await Staff.findById(firstApprover.assignee);
          if (approver && approver.email) {
            const emailContent = buildLeaveRequestNotificationEmail(approver, staff, leaveRequest, leaveType);
            await sendEmail({ to: approver.email, subject: emailContent.subject, html: emailContent.html, text: emailContent.text });
            console.log(`✅ Email sent to ${approver.email} for leave request ${leaveRequest._id}`);
          }
        } else if (firstApprover.role === 'hr' && !firstApprover.assignee) {
          // Notify all HR users
          const hrUsers = await Staff.find({ roles: 'hr' }).select('firstName lastName email').lean();
          for (const hrUser of hrUsers) {
            if (!hrUser?.email) continue;
            const emailContent = buildLeaveRequestNotificationEmail(hrUser, staff, leaveRequest, leaveType);
            await sendEmail({ to: hrUser.email, subject: emailContent.subject, html: emailContent.html, text: emailContent.text });
            console.log(`✅ Email sent to HR (${hrUser.email}) for leave request ${leaveRequest._id}`);
          }
        }
      }
    } catch (emailError) {
      console.error('Failed to send leave request notification email:', emailError);
      // Don't fail the request creation if email fails
    }

    res.status(201).json(leaveRequest);
  } catch (error) {
    console.error('Create leave request error:', error);
    res.status(400).json({ message: error.message || 'Unable to create leave request.' });
  }
};

export const getMyRequests = async (req, res) => {
  const requests = await LeaveRequest.find({ staff: req.user.id })
    .populate('leaveType', 'name code')
    .populate({ path: 'approverChain.assignee', select: 'firstName lastName email' })
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
    // Match pending HR steps assigned to this user OR unassigned HR steps (assignee missing/null)
    conditions.push({
      status: 'pending_hr',
      approverChain: {
        $elemMatch: {
          role: 'hr',
          status: 'pending',
          $or: [
            { assignee: new mongoose.Types.ObjectId(user.id) },
            { assignee: { $exists: false } },
            { assignee: null }
          ],
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
    .populate({ path: 'approverChain.assignee', select: 'firstName lastName email' })
    .sort({ startDate: 1 })
    .lean();

  res.json(requests);
};

const findCurrentPendingStep = (request) => {
  if (!request.status.startsWith('pending_')) return null;
  const statusRole = request.status.replace('pending_', ''); // e.g., 'teamlead', 'linemanager', 'hr'
  // Map status role back to chain role (teamlead -> teamLead, linemanager -> lineManager, hr -> hr)
  const chainRole = statusRole === 'teamlead' ? 'teamLead' 
    : statusRole === 'linemanager' ? 'lineManager' 
    : statusRole; // 'hr' stays as 'hr'
  return request.approverChain.find((step) => step.role === chainRole && step.status === 'pending');
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
    // Helpful debug log for denied approvals — will show the current step, its assignee and the acting user
    try {
      console.warn('[Approve] Denied: step=', JSON.stringify(step), 'user=', JSON.stringify(req.user));
    } catch (e) {
      console.warn('[Approve] Denied (could not serialize step/user)');
    }
    return res.status(403).json({ message: 'You are not authorised to approve this request.' });
  }

  step.status = 'approved';
  step.actedAt = new Date();
  step.comment = comment || undefined;
  leaveRequest.updatedBy = req.user.id;

  appendTimeline(leaveRequest, 'approved', req.user.id, comment);

  const remaining = leaveRequest.approverChain.find((s) => s.status === 'pending');
  const isFinalApproval = !remaining;
  
  if (remaining) {
    // Convert role to lowercase for status consistency
    const roleForStatus = remaining.role.toLowerCase();
    leaveRequest.status = `pending_${roleForStatus}`;
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

  // Send email notifications
  try {
    const approver = await Staff.findById(req.user.id);
    const staff = await Staff.findById(leaveRequest.staff);
    
    if (isFinalApproval) {
      // Final approval - notify staff
      if (staff && staff.email) {
        const emailContent = buildLeaveApprovedEmail(staff, approver, leaveRequest, leaveRequest.leaveType, true);
        await sendEmail({
          to: staff.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
        console.log(`✅ Final approval email sent to ${staff.email} for leave request ${leaveRequest._id}`);
      }
    } else {
      // Not final - notify next approver and staff
      if (remaining) {
        if (remaining.assignee) {
          const nextApprover = await Staff.findById(remaining.assignee);
          if (nextApprover && nextApprover.email) {
            const emailContent = buildLeaveRequestNotificationEmail(nextApprover, staff, leaveRequest, leaveRequest.leaveType);
            await sendEmail({ to: nextApprover.email, subject: emailContent.subject, html: emailContent.html, text: emailContent.text });
            console.log(`✅ Approval notification email sent to ${nextApprover.email} for leave request ${leaveRequest._id}`);
          }
        } else if (remaining.role === 'hr' && !remaining.assignee) {
          const hrUsers = await Staff.find({ roles: 'hr' }).select('firstName lastName email').lean();
          for (const hrUser of hrUsers) {
            if (!hrUser?.email) continue;
            const emailContent = buildLeaveRequestNotificationEmail(hrUser, staff, leaveRequest, leaveRequest.leaveType);
            await sendEmail({ to: hrUser.email, subject: emailContent.subject, html: emailContent.html, text: emailContent.text });
            console.log(`✅ Approval notification email sent to HR (${hrUser.email}) for leave request ${leaveRequest._id}`);
          }
        }
      }
      
      // Also notify staff that their request moved to next stage
      if (staff && staff.email) {
        const emailContent = buildLeaveApprovedEmail(staff, approver, leaveRequest, leaveRequest.leaveType, false);
        await sendEmail({
          to: staff.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
        console.log(`✅ Progress email sent to ${staff.email} for leave request ${leaveRequest._id}`);
      }
    }
  } catch (emailError) {
    console.error('Failed to send approval notification emails:', emailError);
    // Don't fail the approval if email fails
  }

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

  // Send rejection email to staff
  try {
    const approver = await Staff.findById(req.user.id);
    const staff = await Staff.findById(leaveRequest.staff);
    
    if (staff && staff.email) {
      const emailContent = buildLeaveRejectedEmail(staff, approver, leaveRequest, leaveRequest.leaveType, comment);
      await sendEmail({
        to: staff.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
      console.log(`✅ Rejection email sent to ${staff.email} for leave request ${leaveRequest._id}`);
    }
  } catch (emailError) {
    console.error('Failed to send rejection notification email:', emailError);
    // Don't fail the rejection if email fails
  }

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

      // HR: get requests where this HR person is assigned OR all approved requests
      if (userRoles.has('hr')) {
        const teamRequests = await LeaveRequest.find({
          staff: { $ne: userId }, // Exclude own requests (already added)
          $or: [
            { status: 'approved' }, // Show all approved requests
            {
              status: { $in: ['pending_teamlead', 'pending_linemanager', 'pending_hr'] },
              approverChain: {
                $elemMatch: {
                  role: 'hr',
                  assignee: userId,
                },
              },
            },
          ],
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