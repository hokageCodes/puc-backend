import Team from '../models/Team.js';

export const getTeams = async (req, res) => {
  try {
    const teams = await Team.find().populate('department', 'name');
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load teams', details: err.message });
  }
};
