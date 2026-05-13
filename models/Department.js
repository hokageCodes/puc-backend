import mongoose from 'mongoose';

const DepartmentSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  /** `team`: court diary is per team (Litigation). `department`: shared diary for the whole department. */
  courtDiaryScope: {
    type: String,
    enum: ['team', 'department'],
    default: 'department',
  },
});

export default mongoose.model('Department', DepartmentSchema);
