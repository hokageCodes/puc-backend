import Team from '../models/Team.js';

export const getTeams = async (req, res) => {
  try {
    const teams = await Team.find().populate('department', 'name');
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load teams.' });
  }
};
