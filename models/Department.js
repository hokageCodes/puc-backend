import mongoose from 'mongoose';

const DepartmentSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
});

export default mongoose.model('Department', DepartmentSchema);
