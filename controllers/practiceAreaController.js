// controllers/practiceAreaController.js

import PracticeArea from '../models/PracticeArea.js';

export const getPracticeAreas = async (req, res) => {
  try {
    const practiceAreas = await PracticeArea.find();
    res.json(practiceAreas);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load practice areas', details: err.message });
  }
};
