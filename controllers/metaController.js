import Department from '../models/Department.js';
import Team from '../models/Team.js';

export const createDepartment = async (req, res) => {
  try {
    const department = await Department.create(req.body);
    res.status(201).json(department);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getDepartments = async (req, res) => {
  const departments = await Department.find();
  res.json(departments);
};

export const createTeam = async (req, res) => {
  try {
    const team = await Team.create(req.body);
    res.status(201).json(team);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getTeams = async (req, res) => {
  const teams = await Team.find().populate('department');
  res.json(teams);
};
