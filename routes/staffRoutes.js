import express from 'express';
import multer from 'multer';
import { uploadBuffer } from '../config/cloudinary.js';
import {
  getAllStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  getStaffById,
} from '../controllers/staffController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/jpg',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported image type. Allowed: jpg, jpeg, png'));
    }
    cb(null, true);
  },
});

const handleUpload = (validators, handler) => async (req, res, next) => {
  upload.single('profilePhoto')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? 'Profile photo is too large. Maximum size is 5MB.'
          : err.message;
        return res.status(400).json({ error: 'Upload error', message });
      }
      return res.status(400).json({ error: 'Upload error', message: err.message });
    }

    // Push buffer to Cloudinary if a file was provided
    if (req.file) {
      try {
        const result = await uploadBuffer(req.file.buffer, {
          folder: 'puc-staff-photos',
          resource_type: 'image',
        });
        req.file.path = result.secure_url;
        req.file.public_id = result.public_id;
      } catch (uploadErr) {
        console.error('Cloudinary staff photo upload error:', uploadErr);
        return res.status(500).json({ message: `Image upload failed: ${uploadErr.message}` });
      }
    }

    try {
      for (const validator of validators) {
        await validator(req, res, () => {});
        if (res.headersSent) return;
      }
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  });
};

const router = express.Router();

router.use(requireAuth({ scope: 'cms' }));
router.use(requireRoles('admin', 'hr', 'cms'));

const staffWriteAllowlist = [
  'firstName', 'lastName', 'email', 'phoneNumber', 'position', 'bio', 'profilePhoto',
  'department', 'team', 'practiceAreas', 'division', 'teamLeadId', 'lineManagerId',
  'hrId', 'leaveEnabled', 'hireDate', 'confirmationDate', 'isVisible', 'employeeId',
  'roles', 'removeImage',
];

router.get('/', getAllStaff);
router.get('/:id', getStaffById);
router.post('/', handleUpload([validateBody({ allowlist: staffWriteAllowlist, required: ['firstName', 'lastName', 'email'] })], createStaff));
router.put('/:id', handleUpload([validateBody({ allowlist: staffWriteAllowlist })], updateStaff));
router.delete('/:id', deleteStaff);

export default router;
