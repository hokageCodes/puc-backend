import mongoose from 'mongoose';

const LeaveTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    defaultDays: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    requiresDocument: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('LeaveType', LeaveTypeSchema);
