// routes/practiceAreaRoutes.js

import express from 'express';
import {
  getPracticeAreas,
  getPracticeAreaById, // ✅ import the new controller
} from '../controllers/practiceAreaController.js';

const router = express.Router();

router.get('/', getPracticeAreas);
router.get('/:id', getPracticeAreaById); // ✅ add this route

export default router;
