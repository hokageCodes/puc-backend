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

const currentPeriod = (date = new Date()) => {
  const year = date.getUTCFullYear();
  if (!year || isNaN(year)) {
    return new Date().getUTCFullYear();
  }
  return year;
};

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
      { new: true, upsert: true }
    );

    return balance;
  } catch (error) {
    if (error.code === 11000 || error.code === 11001) {
      let existingBalance = await LeaveBalance.findOne({
        staff: staffId,
        leaveType: leaveType._id,
        period,
      });
      
      if (!existingBalance) {
        existingBalance = await LeaveBalance.findOne({
          staff: staffId,
          leaveType: leaveType._id,
          $or: [
            { period },
            { year: period },
          ],
        });
      }
      
      if (existingBalance) {
        if (!existingBalance.period && existingBalance.year) {
          existingBalance.period = existingBalance.year;
          await existingBalance.save();
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
          { new: true, upsert: true }
        );
        return retryBalance;
      } catch (retryError) {
        throw new Error('Failed to create or retrieve leave balance. Please try again.');
      }
    }
    
    throw error;
  }
};

const adjustBalancePending = async ({ staffId, leaveTypeId, period, amount }) => {
  return;
};

const adjustBalanceOnFinalApproval = async ({ staffId, leaveTypeId, period, duration }) => {
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
  return;
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
        remaining: balance.allocated + balance.carriedOver - balance.used,
      };
    })
  );

  res.json(balances);
};

export const createLeaveRequest = async (req, res) => {
  try {
    console.log('📥 CREATE REQUEST START');
    console.log('📥 Content-Type:', req.headers['content-type']);
    console.log('📥 Has file:', !!req.file);
    console.log('📥 Body:', req.body);
    console.log('📥 Body keys:', req.body ? Object.keys(req.body) : 'body is null/undefined');
    
    if (req.file) {
      console.log('📥 File details:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        hasBuffer: !!req.file.buffer,
        bufferLength: req.file.buffer?.length,
      });
    }
    
    // For multipart/form-data, req.body should be populated by multer
    // Check if body exists (it should after multer processes the request)
    if (!req.body) {
      console.error('❌ req.body is null/undefined after multer');
      console.error('❌ This might be a multer configuration issue');
      return res.status(400).json({ 
        message: 'Request body is missing. Please ensure form data is properly formatted.',
      });
    }
    
    const body = req.body;
    
    const leaveTypeId = body.leaveTypeId || body.leaveType;
    const startDate = body.startDate;
    const endDate = body.endDate;
    const halfDay = body.halfDay;
    const coveragePlan = body.coveragePlan;
    const handoverNotes = body.handoverNotes;
    const reason = body.reason;

    console.log('📥 Extracted fields:', { leaveTypeId, startDate, endDate, reason: !!reason });

    if (!leaveTypeId || !startDate || !endDate || !reason) {
      return res.status(400).json({ 
        message: 'Leave type, dates, and reason are required.',
        received: { 
          leaveTypeId: !!leaveTypeId, 
          startDate: !!startDate, 
          endDate: !!endDate, 
          reason: !!reason 
        },
      });
    }

    // Try to resolve leaveTypeId which may be an ObjectId or a string key/name/code
    let leaveType = null;
    if (mongoose.Types.ObjectId.isValid(String(leaveTypeId))) {
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
    
    const startDateObj = new Date(startDate);
    if (isNaN(startDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid start date provided.' });
    }
    
    const period = currentPeriod(startDateObj);
    if (!period || isNaN(period)) {
      return res.status(400).json({ message: 'Invalid period calculated from start date.' });
    }

    await ensureLeaveBalance(staff._id, leaveType, period);

    const approverChain = buildApproverChain(staff);
    const status = deriveStatusFromChain(approverChain);

    // Handle file upload to GridFS - INITIALIZE EMPTY ARRAY FIRST
    const attachments = [];
    
    if (req.file && req.file.buffer) {
      console.log('📎 START: Processing file upload to GridFS');
      console.log('📎 Buffer size:', req.file.buffer.length);
      
      try {
        // Check MongoDB connection
        if (!mongoose.connection.db) {
          console.error('❌ MongoDB not connected');
          throw new Error('Database connection not established');
        }
        
        const GridFSBucket = mongoose.mongo.GridFSBucket;
        const db = mongoose.connection.db;
        const bucket = new GridFSBucket(db, { bucketName: 'leaveAttachments' });
        
        // Generate unique filename
        const timestamp = Date.now();
        const randomSuffix = Math.round(Math.random() * 1E9);
        const fileName = req.file.originalname || 'attachment';
        const gridFilename = `${timestamp}-${randomSuffix}-${fileName}`;
        
        console.log('📎 Creating upload stream:', gridFilename);
        
        // Create upload stream with metadata
        const uploadStream = bucket.openUploadStream(gridFilename, {
          contentType: req.file.mimetype,
          metadata: {
            originalName: req.file.originalname,
            uploadedBy: req.user.id,
            uploadedAt: new Date(),
          },
        });
        
        console.log('📎 Upload stream created, writing buffer...');
        
        // Upload file using Promise
        const fileId = await new Promise((resolve, reject) => {
          // Error handler - MUST be set before writing
          uploadStream.on('error', (error) => {
            console.error('❌ Upload stream error:', error);
            reject(error);
          });
          
          // Finish handler - called when upload completes
          uploadStream.on('finish', () => {
            console.log('✅ Upload stream finished');
            console.log('✅ File ID:', uploadStream.id.toString());
            resolve(uploadStream.id);
          });
          
          // Write buffer and end stream
          console.log('📎 Writing buffer to stream...');
          uploadStream.write(req.file.buffer);
          uploadStream.end();
          console.log('📎 Stream ended, waiting for finish event...');
        });
        
        console.log('✅ Upload completed successfully');
        console.log('✅ File ID:', fileId.toString());
        
        // Create attachment object - THIS IS THE KEY PART
        const attachmentDoc = {
          fileId: fileId,
          filename: req.file.originalname || 'attachment',
          mimetype: req.file.mimetype,
          size: req.file.size,
          uploadedAt: new Date(),
        };
        
        // IMPORTANT: Push to array BEFORE creating document
        attachments.push(attachmentDoc);
        
        console.log('✅ Attachment object created and added to array:', {
          fileId: fileId.toString(),
          filename: attachmentDoc.filename,
          size: attachmentDoc.size,
          arrayLength: attachments.length,
        });
        
      } catch (gridError) {
        console.error('❌ GridFS Error:', {
          message: gridError.message,
          stack: gridError.stack,
          name: gridError.name,
        });
        // Continue without failing the entire request
        console.error('❌ Continuing without attachment');
      }
    } else {
      console.log('ℹ️ No file to upload');
    }
    
    console.log('📎 Final attachments array before save:', {
      length: attachments.length,
      data: attachments,
    });

    // Create leave request - attachments array is now populated
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
      attachments: attachments, // This should now contain the attachment
      approverChain,
      status,
      createdBy: req.user.id,
    });

    appendTimeline(leaveRequest, 'submitted', req.user.id, undefined);

    console.log('💾 Saving leave request with attachments:', {
      attachmentsCount: leaveRequest.attachments.length,
      attachments: leaveRequest.attachments,
    });
    
    await leaveRequest.save();
    console.log('💾 Leave request saved with ID:', leaveRequest._id);
    
    // Verify what was actually saved
    const savedRequest = await LeaveRequest.findById(leaveRequest._id).lean();
    console.log('💾 VERIFICATION - Saved to DB:', {
      id: savedRequest._id,
      attachmentsCount: savedRequest.attachments?.length || 0,
      attachments: savedRequest.attachments,
    });
    
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
            console.log(`✅ Email sent to ${approver.email}`);
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
            console.log(`✅ Email sent to HR (${hrUser.email})`);
          }
        }
      }
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }

    console.log('✅ CREATE REQUEST COMPLETE');
    res.status(201).json(leaveRequest);
    
  } catch (error) {
    console.error('❌ CREATE REQUEST ERROR:', error);
    console.error('❌ Error stack:', error.stack);
    
    let errorMessage = 'Unable to create leave request. Please try again.';
    let statusCode = 400;
    
    if (error.code === 11000 || error.code === 11001) {
      errorMessage = 'A temporary conflict occurred. Please try submitting again.';
    } else if (error.message) {
      errorMessage = error.message;
    } else if (error.name === 'ValidationError') {
      errorMessage = 'Validation error: ' + Object.values(error.errors).map(e => e.message).join(', ');
    }
    
    res.status(statusCode).json({ message: errorMessage });
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

export const getMyApprovals = async (req, res) => {
  try {
    const userId = req.user.id;

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
      .lean();

    const actions = [];
    for (const reqDoc of requests) {
      const staffName = `${reqDoc.staff?.firstName || ''} ${reqDoc.staff?.lastName || ''}`.trim();
      const relevant = (reqDoc.timeline || []).filter((t) =>
        String(t.actor) === String(userId) && ['approved', 'rejected'].includes(t.event)
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

    res.json(actions);
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
  const isFinalApproval = !remaining;
  
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
    });
  }

  await leaveRequest.save();
  await leaveRequest.populate(['leaveType', 'staff']);

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
  }

  res.json(leaveRequest);
};

export const getCalendarData = async (req, res) => {
  const userId = req.user.id;
  const userRoles = new Set(req.user.roles || []);
  const isApprover = userRoles.has('teamLead') || userRoles.has('lineManager') || userRoles.has('hr');

  const myRequests = await LeaveRequest.find({ staff: userId })
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
    
    // Set headers
    res.set({
      'Content-Type': file.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.metadata?.originalName || file.filename}"`,
      'Content-Length': file.length,
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