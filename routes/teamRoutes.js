import express from 'express';
import { getTeams } from '../controllers/teamController.js';

const router = express.Router();

router.get('/', getTeams);

export default router;
