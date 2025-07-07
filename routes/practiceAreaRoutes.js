const express = require('express');
const router = express.Router();
const { getPracticeAreas } = require('../controllers/practiceAreaController');

router.get('/', getPracticeAreas);

module.exports = router;
