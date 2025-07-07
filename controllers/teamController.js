const Team = require('../models/Team');

exports.getTeams = async (req, res) => {
  try {
    const teams = await Team.find().populate('department', 'name');
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load teams', details: err.message });
  }
};
