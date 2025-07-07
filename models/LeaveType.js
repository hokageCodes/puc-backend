import mongoose from 'mongoose';

const LeaveTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    defaultDays: { type: Number, required: true },
});

export default mongoose.model('LeaveType', LeaveTypeSchema);
