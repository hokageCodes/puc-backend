import express from 'express';
import { createDepartment, getDepartments, createTeam, getTeams } from '../controllers/metaController.js';

const router = express.Router();

router.post('/departments', createDepartment);
router.get('/departments', getDepartments);
router.post('/teams', createTeam);
router.get('/teams', getTeams);

export default router;
