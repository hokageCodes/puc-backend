// controllers/practiceAreaController.js

import PracticeArea from '../models/PracticeArea.js';
import mongoose from 'mongoose';

export const getPracticeAreas = async (req, res) => {
  try {
    const practiceAreas = await PracticeArea.find();
    res.json(practiceAreas);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load practice areas.' });
  }
};

export const getPracticeAreaById = async (req, res) => {
  try {
    const practiceAreaId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(practiceAreaId)) {
      return res.status(400).json({ error: 'Invalid practice area id' });
    }

    const practiceArea = await PracticeArea.findById(practiceAreaId);
    if (!practiceArea) return res.status(404).json({ error: 'Practice area not found' });

    res.json(practiceArea);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch practice area.' });
  }
};
