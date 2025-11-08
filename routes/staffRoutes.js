import express from 'express';
import multer from 'multer';
import { storage } from '../config/cloudinary.js';
import {
  getAllStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  getStaffById,
} from '../controllers/staffController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const handleUpload = (handler) => async (req, res, next) => {
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

    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  });
};

const router = express.Router();

router.use(requireAuth({ scope: 'cms' }));
router.use(requireRoles('admin', 'hr', 'cms'));

router.get('/', getAllStaff);
router.get('/:id', getStaffById);
router.post('/', handleUpload(createStaff));
router.put('/:id', handleUpload(updateStaff));
router.delete('/:id', deleteStaff);

export default router;
