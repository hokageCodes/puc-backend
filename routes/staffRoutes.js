import express from 'express';
import multer from 'multer';

import {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
} from '../controllers/staffController.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.get('/', getAllStaff);
router.get('/:id', getStaffById);
router.post('/', upload.single('profilePhoto'), createStaff);
router.put('/:id', updateStaff);
router.delete('/:id', deleteStaff);

export default router;
