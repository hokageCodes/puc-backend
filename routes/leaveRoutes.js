import express from 'express';
import multer from 'multer';
import {
  listLeaveTypes,
  getMyBalances,
  createLeaveRequest,
  getMyRequests,
  getPendingApprovals,
  getMyApprovals,
  approveLeaveRequest,
  rejectLeaveRequest,
  requestWithdrawal,
  confirmWithdrawal,
  declineWithdrawal,
  getCalendarData,
  getAttachment,
} from '../controllers/leaveController.js';
import { requireAuth, ensureLeaveEnrolled, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';

const router = express.Router();

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
]);

// Accept the unified hub session as well as the legacy leave session during
// migration. ensureLeaveEnrolled still gates on leaveEnabled regardless of scope.
router.use(requireAuth({ scope: ['hub', 'leave'] }));
router.use(ensureLeaveEnrolled);

router.get('/types', listLeaveTypes);
router.get('/balances', getMyBalances);
router.get('/calendar', getCalendarData);

// Configure multer for leave request attachments using memory storage.
// Controller persists binary content to GridFS, so disk/cloud storage middleware must not intercept the buffer.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for documents
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported attachment type. Allowed: pdf, doc, docx, txt, jpg, png'));
    }
    cb(null, true);
  },
});

// Custom middleware to handle both multipart and JSON
const handleCreateRequest = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  // If it's multipart/form-data, use multer
  if (contentType.includes('multipart/form-data')) {
    // Multer will parse the multipart form data and populate req.body with text fields
    upload.single('attachment')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'Uploaded file is too large. Maximum size is 10MB.'
            : err.message;
          console.error('❌ Multer error:', err);
          return res.status(400).json({ error: 'Upload error', message });
        }
        console.error('❌ Upload error:', err);
        return res.status(400).json({ error: 'Upload error', message: err.message });
      }
      
      // Multer should populate req.body with text fields
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ 
          error: 'Configuration error',
          message: 'Unable to parse form data. Please ensure the request is properly formatted as multipart/form-data.',
        });
      }
      
      // Ensure req.body is an object (multer should do this, but double-check)
      if (!req.body || typeof req.body !== 'object') {
        req.body = {};
      }
      
      next();
    });
  } else {
    next();
  }
};

// Use custom middleware for POST /requests
router.post(
  '/requests',
  handleCreateRequest,
  validateBody({
    allowlist: ['leaveTypeId', 'leaveType', 'startDate', 'endDate', 'halfDay', 'coveragePlan', 'handoverNotes', 'reason', 'leaveAllowance', 'allowanceMonth'],
    required: ['leaveTypeId', 'startDate', 'endDate', 'reason'],
  }),
  createLeaveRequest
);
router.get('/requests', getMyRequests);

// Route to download attachments from GridFS
router.get('/attachments/:fileId', getAttachment);

router.get('/approvals', getPendingApprovals);
router.get('/approvals/history', getMyApprovals);
router.post('/requests/:id/approve', requireRoles('teamLead', 'lineManager', 'hr'), validateBody({ allowlist: ['comment'] }), approveLeaveRequest);
router.post('/requests/:id/reject', requireRoles('teamLead', 'lineManager', 'hr'), validateBody({ allowlist: ['comment'] }), rejectLeaveRequest);

// Withdrawal: staff withdraws their own request; managers confirm/decline an approved one.
router.post('/requests/:id/withdraw', validateBody({ allowlist: ['reason'] }), requestWithdrawal);
router.post('/requests/:id/withdraw/confirm', requireRoles('teamLead', 'lineManager', 'hr', 'admin'), validateBody({ allowlist: ['comment'] }), confirmWithdrawal);
router.post('/requests/:id/withdraw/decline', requireRoles('teamLead', 'lineManager', 'hr', 'admin'), validateBody({ allowlist: ['comment'] }), declineWithdrawal);

export default router;