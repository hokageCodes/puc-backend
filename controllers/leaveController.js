import mongoose from 'mongoose';
import LeaveType from '../models/LeaveType.js';
import LeaveBalance from '../models/LeaveBalance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Staff from '../models/Staff.js';
import { sendEmail } from '../utils/email.js';
import { logAudit } from '../utils/auditLogger.js';
import { calculateDurationDays } from '../utils/leaveDays.js';
import {
  buildLeaveRequestNotificationEmail,
  buildLeaveApprovedEmail,
  buildLeaveRejectedEmail,
} from '../utils/email.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');
const toObjectIdOrNull = (value) => {
  const normalized = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(normalized) ? new mongoose.Types.ObjectId(normalized) : null;
};

const parsePagination = (query, defaultLimit = 50) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 200);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const currentPeriod = (date = new Date()) => {
  const year = date.getUTCFullYear();
  if (!year || isNaN(year)) {
    return new Date().getUTCFullYear();
  }
  return year;
};


const ensureLeaveBalance = async (staffId, leaveType, period, options = {}) => {
  const { session } = options;
  if (!period || isNaN(period) || period === null) {
    throw new Error('Invalid period value. Cannot create leave balance.');
  }

  const defaultAllocation =
    typeof leaveType.defaultDays === 'number'
      ? leaveType.defaultDays
      : leaveType.defaultAnnualAllocation ?? 0;

  try {
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
      { new: true, upsert: true, session }
    );

    return balance;
  } catch (error) {
    if (error.code === 11000 || error.code === 11001) {
      let existingBalance = await LeaveBalance.findOne({
        staff: staffId,
        leaveType: leaveType._id,
        period,
      }).session(session || null);
      
      if (!existingBalance) {
        existingBalance = await LeaveBalance.findOne({
          staff: staffId,
          leaveType: leaveType._id,
          $or: [
            { period },
            { year: period },
          ],
        }).session(session || null);
      }
      
      if (existingBalance) {
        if (!existingBalance.period && existingBalance.year) {
          existingBalance.period = existingBalance.year;
          await existingBalance.save({ session });
        }
        return existingBalance;
      }
      
      try {
        const retryBalance = await LeaveBalance.findOneAndUpdate(
          { staff: staffId, leaveType: leaveType._id, period },
          {
            $setOnInsert: {
              allocated: defaultAllocation,
              carriedOver: 0,
              used: 0,
              pending: 0,
            },
          },
          { new: true, upsert: true, session }
        );
        return retryBalance;
      } catch (retryError) {
        throw new Error('Failed to create or retrieve leave balance. Please try again.');
      }
    }
    
    throw error;
  }
};

const adjustBalancePending = async ({ staffId, leaveTypeId, period, amount, session }) => {
  await LeaveBalance.updateOne(
    { staff: staffId, leaveType: leaveTypeId, period },
    { $inc: { pending: amount } },
    { session }
  );
};

const adjustBalanceOnFinalApproval = async ({ staffId, leaveTypeId, period, duration, session }) => {
  await LeaveBalance.updateOne(
    { staff: staffId, leaveType: leaveTypeId, period },
    { $inc: { used: duration, pending: -duration } },
    { session }
  );
};

const adjustBalanceOnRejection = async ({ staffId, leaveTypeId, period, duration, session }) => {
  await LeaveBalance.updateOne(
    { staff: staffId, leaveType: leaveTypeId, period },
    { $inc: { pending: -duration } },
    { session }
  );
};

const buildApproverChain = (staffDoc) => {
  const chain = [];

  const resolveId = (val) => {
    if (!val) return null;
    if (typeof val === 'object' && val._id) return val._id;
    return val;
  };

  const tl = resolveId(staffDoc.teamLeadId);
  if (tl) {
    chain.push({ role: 'teamLead', assignee: tl });
  }

  const lm = resolveId(staffDoc.lineManagerId);
  if (lm) {
    chain.push({ role: 'lineManager', assignee: lm });
  }

  const hr = resolveId(staffDoc.hrId);
  chain.push({ role: 'hr', assignee: hr || null });

  return chain.map((step) => ({ ...step, status: 'pending' }));
};

const deriveStatusFromChain = (chain) => {
  const next = chain.find((step) => step.status === 'pending');
  if (!next) {
    return 'approved';
  }
  const roleForStatus = next.role.toLowerCase();
  return `pending_${roleForStatus}`;
};

const appendTimeline = (request, event, actorId, note) => {
  request.timeline.push({ event, actor: actorId, timestamp: new Date(), note });
};

export const listLeaveTypes = async (req, res) => {
  try {
    const types = await LeaveType.find({ isActive: true }).sort({ name: 1 }).lean();
    res.json(types);
  } catch (err) {
    console.error('listLeaveTypes error:', err);
    res.status(500).json({ message: 'Failed to load leave types.' });
  }
};

export const getMyBalances = async (req, res) => {
  try {
    const period = currentPeriod();
    const staffId = req.user.id;
    const types = await LeaveType.find({ isActive: true }).lean();
    const typeIds = types.map((t) => t._id);

    // Bulk fetch — one query instead of N
    const existingBalances = await LeaveBalance.find({
      staff: staffId,
      period,
      leaveType: { $in: typeIds },
    }).lean();

    const balanceMap = new Map(existingBalances.map((b) => [b.leaveType.toString(), b]));

    const balances = await Promise.all(
      types.map(async (type) => {
        const balance = balanceMap.get(type._id.toString()) ?? await ensureLeaveBalance(staffId, type, period);
        return {
          type: { id: type._id, name: type.name, code: type.code },
          period: balance.period,
          allocated: balance.allocated,
          carriedOver: balance.carriedOver,
          used: balance.used,
          pending: balance.pending,
          remaining: balance.allocated + balance.carriedOver - balance.used,
        };
      })
    );

    res.json(balances);
  } catch (err) {
    console.error('getMyBalances error:', err);
    res.status(500).json({ message: 'Failed to load leave balances.' });
  }
};

export const createLeaveRequest = async (req, res) => {
  let uploadedFileId = null; // track for cleanup on failure

  try {
    if (!req.body) {
      return res.status(400).json({ message: 'Request body is missing.' });
    }

    const body = req.body;
    const leaveTypeId = normalizeString(body.leaveTypeId || body.leaveType);
    const startDate = body.startDate;
    const endDate = body.endDate;
    const halfDay = body.halfDay;
    const coveragePlan = body.coveragePlan;
    const handoverNotes = body.handoverNotes;
    const reason = body.reason;

    if (!leaveTypeId || !startDate || !endDate || !reason) {
      return res.status(400).json({ message: 'Leave type, dates, and reason are required.' });
    }

    // Try to resolve leaveTypeId which may be an ObjectId or a string key/name/code
    let leaveType = null;
    if (mongoose.Types.ObjectId.isValid(leaveTypeId)) {
      leaveType = await LeaveType.findById(leaveTypeId);
    }

    if (!leaveType) {
      // Attempt to find by code, key, or name as a fallback for legacy clients
      leaveType = await LeaveType.findOne({
        $or: [
          { code: leaveTypeId },
          { key: leaveTypeId },
          { name: leaveTypeId },
        ],
      });
    }

    if (!leaveType || !leaveType.isActive) {
      return res.status(404).json({ message: 'Leave type not found.' });
    }

    const staff = await Staff.findById(req.user.id).populate('teamLeadId lineManagerId hrId');
    if (!staff) {
      return res.status(404).json({ message: 'Staff profile not found.' });
    }

    const durationDays = calculateDurationDays(startDate, endDate, halfDay);
    if (!durationDays || durationDays <= 0) {
      return res.status(400).json({ message: 'The selected dates contain no working days (weekends are not counted).' });
    }

    const startDateObj = new Date(startDate);
    if (isNaN(startDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid start date provided.' });
    }

    const period = currentPeriod(startDateObj);
    if (!period || isNaN(period)) {
      return res.status(400).json({ message: 'Invalid period calculated from start date.' });
    }

    const approverChain = buildApproverChain(staff);
    const status = deriveStatusFromChain(approverChain);

    // Upload file to GridFS before the transaction. Track the fileId so we can
    // delete it if the transaction later fails (overlap conflict etc.).
    const attachments = [];

    if (req.file && req.file.buffer) {
      if (!mongoose.connection.db) {
        return res.status(503).json({ message: 'Database connection not established.' });
      }

      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'leaveAttachments' });
      const safeOriginalName = (req.file.originalname || 'attachment').replace(/[^\w.\-]/g, '_');
      const gridFilename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeOriginalName}`;

      const uploadStream = bucket.openUploadStream(gridFilename, {
        contentType: req.file.mimetype,
        metadata: { originalName: safeOriginalName, uploadedBy: req.user.id, uploadedAt: new Date() },
      });

      const fileId = await new Promise((resolve, reject) => {
        uploadStream.on('error', reject);
        uploadStream.on('finish', () => resolve(uploadStream.id));
        uploadStream.write(req.file.buffer);
        uploadStream.end();
      });

      uploadedFileId = fileId; // track for cleanup
      attachments.push({
        fileId,
        filename: safeOriginalName,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date(),
      });
    }

    const session = await mongoose.startSession();
    let leaveRequest;
    try {
      await session.withTransaction(async () => {
        // Lock the staff row to serialize concurrent requests from the same user.
        await Staff.updateOne({ _id: staff._id }, { $set: { updatedAt: new Date() } }, { session });

        // Standard date-overlap check (single condition covers all cases).
        const overlap = await LeaveRequest.findOne({
          staff: staff._id,
          status: { $nin: ['rejected', 'cancelled'] },
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        }).session(session);

        if (overlap) throw new Error('OVERLAP_CONFLICT');

        await ensureLeaveBalance(staff._id, leaveType, period, { session });

        // Mark days as pending so subsequent requests see reduced availability.
        await adjustBalancePending({
          staffId: staff._id,
          leaveTypeId: leaveType._id,
          period,
          amount: durationDays,
          session,
        });

        leaveRequest = new LeaveRequest({
          staff: staff._id,
          leaveType: leaveType._id,
          startDate,
          endDate,
          durationDays,
          halfDay: halfDay || undefined,
          coveragePlan: coveragePlan || undefined,
          handoverNotes: handoverNotes ? handoverNotes.trim() : undefined,
          reason: reason.trim(),
          attachments,
          approverChain,
          status,
          createdBy: req.user.id,
        });

        appendTimeline(leaveRequest, 'submitted', req.user.id, undefined);
        await leaveRequest.save({ session });
      });
    } catch (txErr) {
      // Transaction failed — delete orphaned GridFS file if one was uploaded.
      if (uploadedFileId) {
        try {
          const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'leaveAttachments' });
          await bucket.delete(uploadedFileId);
        } catch { /* best-effort */ }
      }
      throw txErr;
    } finally {
      session.endSession();
    }

    if (!leaveRequest?._id) {
      throw new Error('Unable to create leave request.');
    }

    await leaveRequest.populate([{ path: 'leaveType', select: 'name code' }]);

    // Send email notification
    try {
      const firstApprover = approverChain.find((step) => step.status === 'pending');
      if (firstApprover) {
        if (firstApprover.assignee) {
          const approver = await Staff.findById(firstApprover.assignee);
          if (approver && approver.email) {
            const emailContent = buildLeaveRequestNotificationEmail(approver, staff, leaveRequest, leaveType);
            await sendEmail({ 
              to: approver.email, 
              subject: emailContent.subject, 
              html: emailContent.html, 
              text: emailContent.text 
            });
            // Email sent to ${approver.email}
          }
        } else if (firstApprover.role === 'hr' && !firstApprover.assignee) {
          const hrUsers = await Staff.find({ roles: 'hr' }).select('firstName lastName email').lean();
          for (const hrUser of hrUsers) {
            if (!hrUser?.email) continue;
            const emailContent = buildLeaveRequestNotificationEmail(hrUser, staff, leaveRequest, leaveType);
            await sendEmail({ 
              to: hrUser.email, 
              subject: emailContent.subject, 
              html: emailContent.html, 
              text: emailContent.text 
            });
            // Email sent to HR (${hrUser.email})
          }
        }
      }
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
      await logAudit('EMAIL_SEND_FAILURE', {
        req,
        event: 'leave-request-notification',
        error: emailError?.message || emailError,
        leaveRequestId: leaveRequest?._id?.toString?.(),
        staffId: staff?._id?.toString?.(),
        to: (firstApprover?.assignee && approver?.email) || undefined,
      });
    }

    await logAudit('LEAVE_REQUEST_CREATE', {
      req,
      leaveRequestId: leaveRequest._id.toString(),
      staffId: staff._id.toString(),
      leaveTypeId: leaveType._id.toString(),
      status: leaveRequest.status,
    });
    res.status(201).json(leaveRequest);
    
  } catch (error) {
    console.error('createLeaveRequest error:', error.message);

    if (error.message === 'OVERLAP_CONFLICT') {
      return res.status(409).json({ message: 'You already have a leave request that overlaps with these dates.' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: Object.values(error.errors).map((e) => e.message).join(', ') });
    }
    if (error.code === 11000 || error.code === 11001) {
      return res.status(409).json({ message: 'A temporary conflict occurred. Please try submitting again.' });
    }
    res.status(500).json({ message: 'Unable to create leave request. Please try again.' });
  }
};

export const getMyRequests = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { staff: req.user.id };
    const [requests, total] = await Promise.all([
      LeaveRequest.find(filter)
        .select('-__v -timeline -updatedBy')
        .populate('leaveType', 'name code')
        .populate({ path: 'approverChain.assignee', select: 'firstName lastName email' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LeaveRequest.countDocuments(filter),
    ]);

    const safeRequests = requests.map((r) => {
      if (Array.isArray(r.attachments)) {
        r.attachments = r.attachments.map((a) => ({
          fileId: a.fileId,
          filename: a.filename,
          mimetype: a.mimetype,
          size: a.size,
          uploadedAt: a.uploadedAt,
        }));
      }
      return r;
    });

    res.set('X-Total-Count', String(total));
    res.set('X-Total-Pages', String(Math.ceil(total / limit)));
    res.set('X-Page', String(page));
    res.set('X-Limit', String(limit));
    res.json(safeRequests);
  } catch (err) {
    console.error('getMyRequests error:', err);
    res.status(500).json({ message: 'Failed to load leave requests.' });
  }
};

const buildApproverMatchConditions = (user) => {
  const conditions = [];
  const roles = new Set(user.roles || []);
  const approverId = toObjectIdOrNull(user.id);
  if (!approverId) {
    return conditions;
  }

  if (roles.has('teamLead')) {
    conditions.push({
      status: 'pending_teamlead',
      approverChain: {
        $elemMatch: {
          role: 'teamLead',
          status: 'pending',
          assignee: approverId,
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
          assignee: approverId,
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
          $or: [
            { assignee: approverId },
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
  try {
    const matchConditions = buildApproverMatchConditions(req.user);
    if (matchConditions.length === 0) return res.json([]);

    const { page, limit, skip } = parsePagination(req.query);
    const filter = { $or: matchConditions };
    const [requests, total] = await Promise.all([
      LeaveRequest.find(filter)
        .populate('staff', 'firstName lastName staffCode division')
        .populate('leaveType', 'name code')
        .populate({ path: 'approverChain.assignee', select: 'firstName lastName email' })
        .sort({ startDate: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LeaveRequest.countDocuments(filter),
    ]);

    res.set('X-Total-Count', String(total));
    res.set('X-Total-Pages', String(Math.ceil(total / limit)));
    res.set('X-Page', String(page));
    res.set('X-Limit', String(limit));
    res.json(requests);
  } catch (err) {
    console.error('getPendingApprovals error:', err);
    res.status(500).json({ message: 'Failed to load pending approvals.' });
  }
};

export const getMyApprovals = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit, skip } = parsePagination(req.query);

    const requests = await LeaveRequest.find({
      timeline: {
        $elemMatch: {
          actor: userId,
          event: { $in: ['approved', 'rejected'] },
        },
      },
    })
      .populate('leaveType', 'name code')
      .populate('staff', 'firstName lastName staffCode')
      .sort({ updatedAt: -1 })
      .lean();

    const actions = [];
    for (const reqDoc of requests) {
      const staffName = `${reqDoc.staff?.firstName || ''} ${reqDoc.staff?.lastName || ''}`.trim();
      const relevant = (reqDoc.timeline || []).filter(
        (t) => String(t.actor) === String(userId) && ['approved', 'rejected'].includes(t.event)
      );

      for (const t of relevant) {
        actions.push({
          requestId: reqDoc._id,
          event: t.event,
          timestamp: t.timestamp,
          note: t.note || null,
          leaveType: reqDoc.leaveType?.name || null,
          staffName,
          status: reqDoc.status,
          startDate: reqDoc.startDate,
          endDate: reqDoc.endDate,
          durationDays: reqDoc.durationDays,
        });
      }
    }

    actions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = actions.length;
    const paginated = actions.slice(skip, skip + limit);

    res.set('X-Total-Count', String(total));
    res.set('X-Total-Pages', String(Math.ceil(total / limit)));
    res.set('X-Page', String(page));
    res.set('X-Limit', String(limit));
    res.json(paginated);
  } catch (error) {
    console.error('getMyApprovals error:', error);
    res.status(500).json({ message: 'Failed to load approvals history.' });
  }
};

const findCurrentPendingStep = (request) => {
  if (!request.status.startsWith('pending_')) return null;
  const statusRole = request.status.replace('pending_', '');
  const chainRole = statusRole === 'teamlead' ? 'teamLead' 
    : statusRole === 'linemanager' ? 'lineManager' 
    : statusRole;
  return request.approverChain.find((step) => step.role === chainRole && step.status === 'pending');
};

const userCanActOnStep = (step, user) => {
  if (!step) return false;
  if (step.assignee) {
    return step.assignee.toString() === user.id;
  }
  return (user.roles || []).includes(step.role);
};

export const approveLeaveRequest = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body || {};
  const leaveRequestId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(leaveRequestId)) {
    return res.status(400).json({ message: 'Invalid leave request id.' });
  }

  const session = await mongoose.startSession();
  let leaveRequest;
  let remaining;
  let isFinalApproval = false;
  let actionApplied = false;

  try {
    await session.withTransaction(async () => {
      leaveRequest = await LeaveRequest.findById(leaveRequestId).session(session);
      if (!leaveRequest) {
        throw new Error('LEAVE_REQUEST_NOT_FOUND');
      }

      // Prevent self-approval
      if (leaveRequest.staff.toString() === req.user.id) {
        throw new Error('SELF_APPROVAL_FORBIDDEN');
      }

      if (leaveRequest.status === 'approved') {
        // Idempotent: already approved, nothing to mutate.
        return;
      }

      const step = findCurrentPendingStep(leaveRequest);
      if (!userCanActOnStep(step, req.user)) {
        throw new Error('NOT_AUTHORISED_FOR_STEP');
      }

      step.status = 'approved';
      step.actedAt = new Date();
      step.comment = comment || undefined;
      leaveRequest.updatedBy = req.user.id;
      actionApplied = true;

      appendTimeline(leaveRequest, 'approved', req.user.id, comment);

      remaining = leaveRequest.approverChain.find((s) => s.status === 'pending');
      isFinalApproval = !remaining;

      if (remaining) {
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
          session,
        });
      }

      await leaveRequest.save({ session });
    });
  } catch (error) {
    session.endSession();
    if (error.message === 'LEAVE_REQUEST_NOT_FOUND') {
      return res.status(404).json({ message: 'Leave request not found.' });
    }
    if (error.message === 'SELF_APPROVAL_FORBIDDEN') {
      return res.status(403).json({ message: 'You cannot approve your own leave request.' });
    }
    if (error.message === 'NOT_AUTHORISED_FOR_STEP') {
      return res.status(403).json({ message: 'You are not authorised to approve this request.' });
    }
    console.error('approveLeaveRequest transaction error:', error);
    return res.status(409).json({ message: 'Unable to approve request right now. Please retry.' });
  }

  session.endSession();
  await leaveRequest.populate(['leaveType', 'staff']);

  if (!actionApplied) {
    return res.json(leaveRequest);
  }
  await logAudit('LEAVE_REQUEST_APPROVE', {
    req,
    leaveRequestId: leaveRequest._id.toString(),
    staffId: leaveRequest.staff?._id?.toString?.() || leaveRequest.staff?.toString?.(),
    finalApproval: isFinalApproval,
    status: leaveRequest.status,
  });

  try {
    const approver = await Staff.findById(req.user.id);
    const staff = await Staff.findById(leaveRequest.staff);
    
    if (isFinalApproval) {
      if (staff && staff.email) {
        const emailContent = buildLeaveApprovedEmail(staff, approver, leaveRequest, leaveRequest.leaveType, true);
        await sendEmail({
          to: staff.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }
    } else {
      if (remaining) {
        if (remaining.assignee) {
          const nextApprover = await Staff.findById(remaining.assignee);
          if (nextApprover && nextApprover.email) {
            const emailContent = buildLeaveRequestNotificationEmail(nextApprover, staff, leaveRequest, leaveRequest.leaveType);
            await sendEmail({ to: nextApprover.email, subject: emailContent.subject, html: emailContent.html, text: emailContent.text });
          }
        } else if (remaining.role === 'hr' && !remaining.assignee) {
          const hrUsers = await Staff.find({ roles: 'hr' }).select('firstName lastName email').lean();
          for (const hrUser of hrUsers) {
            if (!hrUser?.email) continue;
            const emailContent = buildLeaveRequestNotificationEmail(hrUser, staff, leaveRequest, leaveRequest.leaveType);
            await sendEmail({ to: hrUser.email, subject: emailContent.subject, html: emailContent.html, text: emailContent.text });
          }
        }
      }
      
      if (staff && staff.email) {
        const emailContent = buildLeaveApprovedEmail(staff, approver, leaveRequest, leaveRequest.leaveType, false);
        await sendEmail({
          to: staff.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }
    }
  } catch (emailError) {
    console.error('Failed to send approval emails:', emailError);
    await logAudit('EMAIL_SEND_FAILURE', {
      req,
      event: 'leave-approval',
      error: emailError?.message || emailError,
      leaveRequestId: leaveRequest?._id?.toString?.(),
      staffId: staff?._id?.toString?.(),
      to: staff?.email,
    });
  }

  res.json(leaveRequest);
};

export const rejectLeaveRequest = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body || {};
  const leaveRequestId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(leaveRequestId)) {
    return res.status(400).json({ message: 'Invalid leave request id.' });
  }

  const session = await mongoose.startSession();
  let leaveRequest;

  try {
    await session.withTransaction(async () => {
      leaveRequest = await LeaveRequest.findById(leaveRequestId).session(session);
      if (!leaveRequest) throw new Error('LEAVE_REQUEST_NOT_FOUND');

      if (leaveRequest.staff.toString() === req.user.id) throw new Error('SELF_REJECT_FORBIDDEN');
      if (leaveRequest.status === 'rejected') return; // idempotent

      const step = findCurrentPendingStep(leaveRequest);
      if (!userCanActOnStep(step, req.user)) throw new Error('NOT_AUTHORISED_FOR_STEP');

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
        session,
      });

      await leaveRequest.save({ session });
    });
  } catch (error) {
    session.endSession();
    if (error.message === 'LEAVE_REQUEST_NOT_FOUND') return res.status(404).json({ message: 'Leave request not found.' });
    if (error.message === 'SELF_REJECT_FORBIDDEN') return res.status(403).json({ message: 'You cannot reject your own leave request.' });
    if (error.message === 'NOT_AUTHORISED_FOR_STEP') return res.status(403).json({ message: 'You are not authorised to reject this request.' });
    console.error('rejectLeaveRequest error:', error);
    return res.status(409).json({ message: 'Unable to reject request right now. Please retry.' });
  }

  session.endSession();
  await leaveRequest.populate(['leaveType', 'staff']);
  await logAudit('LEAVE_REQUEST_REJECT', {
    req,
    leaveRequestId: leaveRequest._id.toString(),
    staffId: leaveRequest.staff?._id?.toString?.() || leaveRequest.staff?.toString?.(),
    status: leaveRequest.status,
  });

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
    }
  } catch (emailError) {
    console.error('Failed to send rejection email:', emailError);
    await logAudit('EMAIL_SEND_FAILURE', {
      req,
      event: 'leave-rejection',
      error: emailError?.message || emailError,
      leaveRequestId: leaveRequest?._id?.toString?.(),
      staffId: staff?._id?.toString?.(),
      to: staff?.email,
    });
  }

  res.json(leaveRequest);
};

export const getCalendarData = async (req, res) => {
  try {
  const userId = req.user.id;
  const userRoles = new Set(req.user.roles || []);
  const isApprover = userRoles.has('teamLead') || userRoles.has('lineManager') || userRoles.has('hr');

  // Default window: current year ±1 to keep queries bounded
  const now = new Date();
  const windowStart = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear() - 1, 0, 1);
  const windowEnd = req.query.to ? new Date(req.query.to) : new Date(now.getFullYear() + 1, 11, 31);
  const dateFilter = { startDate: { $lte: windowEnd }, endDate: { $gte: windowStart } };

  const myRequests = await LeaveRequest.find({ staff: userId, ...dateFilter })
    .populate('leaveType', 'name code')
    .populate('staff', 'firstName lastName')
    .sort({ startDate: 1 })
    .lean();

  const events = myRequests
    .filter((req) => req.leaveType)
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

  if (isApprover) {
    const staff = await Staff.findById(userId);
    if (staff) {
      const teamConditions = [];

      if (userRoles.has('teamLead')) {
        teamConditions.push({ teamLeadId: userId });
      }

      if (userRoles.has('lineManager')) {
        teamConditions.push({ lineManagerId: userId });
      }

      if (userRoles.has('hr')) {
        const teamRequests = await LeaveRequest.find({
          staff: { $ne: userId },
          ...dateFilter,
          $or: [
            { status: 'approved' },
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
          .filter((req) => req.leaveType && req.staff)
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
        const teamStaff = await Staff.find({ $or: teamConditions }).select('_id').lean();
        const teamStaffIds = teamStaff.map((s) => s._id);

        if (teamStaffIds.length > 0) {
          const teamRequests = await LeaveRequest.find({
            staff: { $in: teamStaffIds },
            status: { $in: ['approved', 'pending_teamlead', 'pending_linemanager', 'pending_hr'] },
            ...dateFilter,
          })
            .populate('leaveType', 'name code')
            .populate('staff', 'firstName lastName')
            .sort({ startDate: 1 })
            .lean();

          teamRequests
            .filter((req) => req.leaveType && req.staff)
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
}
catch (err) {
  console.error('getCalendarData error:', err);
  res.status(500).json({ message: 'Failed to load calendar data.' });
}
};

// Get attachment file from GridFS
export const getAttachment = async (req, res) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ message: 'Invalid file ID' });
    }
    
    const objectFileId = new mongoose.Types.ObjectId(fileId);

    const linkedRequest = await LeaveRequest.findOne({
      'attachments.fileId': objectFileId,
    })
      .select('staff approverChain status')
      .lean();

    if (!linkedRequest) {
      return res.status(404).json({ message: 'Attachment not linked to any leave request' });
    }

    const roles = new Set(req.user.roles || []);
    const isOwner = String(linkedRequest.staff) === String(req.user.id);
    const isPrivilegedRole = roles.has('admin') || roles.has('hr');
    const explicitlyAssignedApprover = Array.isArray(linkedRequest.approverChain)
      && linkedRequest.approverChain.some((step) => step.assignee && String(step.assignee) === String(req.user.id));
    const fallbackHrApprover = roles.has('hr')
      && Array.isArray(linkedRequest.approverChain)
      && linkedRequest.approverChain.some((step) => step.role === 'hr' && !step.assignee);

    if (!isOwner && !isPrivilegedRole && !explicitlyAssignedApprover && !fallbackHrApprover) {
      return res.status(403).json({ message: 'Not authorised to access this attachment' });
    }

    // Check MongoDB connection
    if (!mongoose.connection.db) {
      return res.status(503).json({ message: 'Database connection not established' });
    }
    
    const GridFSBucket = mongoose.mongo.GridFSBucket;
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'leaveAttachments' });
    
    // Check if file exists
    const files = await bucket.find({ _id: objectFileId }).toArray();
    if (files.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    const file = files[0];
    
    // Sanitize filename — strip everything except safe characters to prevent header injection.
    const rawName = file.metadata?.originalName || file.filename || 'attachment';
    const safeFilename = rawName.replace(/[^\w.\-]/g, '_');

    res.set({
      'Content-Type': file.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Content-Length': file.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    
    // Stream file to response
    const downloadStream = bucket.openDownloadStream(objectFileId);
    downloadStream.pipe(res);
    
    downloadStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error downloading file' });
      }
    });
  } catch (error) {
    console.error('Get attachment error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error retrieving attachment' });
    }
  }
};