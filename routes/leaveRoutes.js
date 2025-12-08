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
  getCalendarData,
  getAttachment,
} from '../controllers/leaveController.js';
import { requireAuth, ensureLeaveEnrolled, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth({ scope: 'leave' }));
router.use(ensureLeaveEnrolled);

router.get('/types', listLeaveTypes);
router.get('/balances', getMyBalances);
router.get('/calendar', getCalendarData);

// Configure multer for leave request attachments - using memory storage to get buffer
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory so we can save to MongoDB
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for documents
  fileFilter: (req, file, cb) => {
    console.log('📎 Multer fileFilter - Checking file:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
    });
    cb(null, true); // Accept all files for now
  },
});

// Custom middleware to handle both multipart and JSON
const handleCreateRequest = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  console.log('📥 ========== handleCreateRequest middleware ==========');
  console.log('📥 Content-Type:', contentType);
  console.log('📥 Is multipart?', contentType.includes('multipart/form-data'));
  console.log('📥 req.body BEFORE multer:', req.body);
  console.log('📥 req.body type BEFORE:', typeof req.body);
  
  // If it's multipart/form-data, use multer
  if (contentType.includes('multipart/form-data')) {
    console.log('📥 Using multer to parse multipart data');
    
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
      
      // Log what multer parsed
      console.log('📥 ========== After multer processing ==========');
      console.log('📥 req.body:', req.body);
      console.log('📥 req.body type:', typeof req.body);
      console.log('📥 req.body keys:', req.body ? Object.keys(req.body) : 'no body');
      console.log('📥 req.file:', req.file ? 'File present' : 'No file');
      
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
      
      // IMPORTANT: Multer should populate req.body with text fields
      // If req.body is undefined, there's a configuration issue
      if (!req.body || typeof req.body !== 'object') {
        console.error('❌ CRITICAL: req.body is undefined or not an object after multer processing');
        console.error('❌ req.body value:', req.body);
        console.error('❌ This indicates multer is not parsing form fields correctly');
        console.error('❌ Possible causes:');
        console.error('   1. express.json() or express.urlencoded() consumed the stream before multer');
        console.error('   2. Multer configuration issue');
        console.error('   3. Request format issue');
        return res.status(400).json({ 
          error: 'Configuration error',
          message: 'Unable to parse form data. Please ensure the request is properly formatted as multipart/form-data.',
        });
      }
      
      // Ensure req.body is an object (multer should do this, but double-check)
      if (!req.body || typeof req.body !== 'object') {
        req.body = {};
      }
      
      console.log('📥 ========== Proceeding to controller ==========');
      next();
    });
  } else {
    // For JSON requests, express.json() middleware would have already parsed it
    console.log('📥 JSON request (no file), body already parsed');
    console.log('📥 req.body:', req.body);
    next();
  }
};

// Use custom middleware for POST /requests
router.post('/requests', handleCreateRequest, createLeaveRequest);
router.get('/requests', getMyRequests);

// Route to download attachments from GridFS
router.get('/attachments/:fileId', getAttachment);

router.get('/approvals', getPendingApprovals);
router.get('/approvals/history', getMyApprovals);
router.post('/requests/:id/approve', requireRoles('teamLead', 'lineManager', 'hr'), approveLeaveRequest);
router.post('/requests/:id/reject', requireRoles('teamLead', 'lineManager', 'hr'), rejectLeaveRequest);

export default router;