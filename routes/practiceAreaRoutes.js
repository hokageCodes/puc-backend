// routes/practiceAreaRoutes.js

import express from 'express';
import { getPracticeAreas } from '../controllers/practiceAreaController.js';

const router = express.Router();

router.get('/', getPracticeAreas);

export default router;
