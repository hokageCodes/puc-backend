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

export const getPracticeAreaById = async (req, res) => {
  try {
    const practiceArea = await PracticeArea.findById(req.params.id);
    if (!practiceArea) return res.status(404).json({ error: 'Practice area not found' });

    res.json(practiceArea);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch practice area', details: err.message });
  }
};
