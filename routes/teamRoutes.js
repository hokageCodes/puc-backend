const express = require('express');
const router = express.Router();
const { getTeams } = require('../controllers/teamController');

router.get('/', getTeams);

module.exports = router;
