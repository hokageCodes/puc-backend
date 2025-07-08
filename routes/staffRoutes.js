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

const upload = multer({ storage });

const router = express.Router();

router.get('/', getAllStaff);
router.get('/:id', getStaffById);
router.post('/', upload.single('profilePhoto'), createStaff); // ✅ Cloudinary upload here
router.put('/:id', updateStaff);
router.delete('/:id', deleteStaff);

export default router;
