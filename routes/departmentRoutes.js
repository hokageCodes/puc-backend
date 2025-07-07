import express from 'express';
import { getDepartments } from '../controllers/departmentController.js';

const router = express.Router();

router.get('/', getDepartments);

export default router;
