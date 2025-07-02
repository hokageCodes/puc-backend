import mongoose from 'mongoose'

const StaffSchema = new mongoose.Schema({
firstName: String,
lastName: String,
email: { type: String, unique: true },
phoneNumber: String,
profilePic: String,
bio: String,

department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },

isTeamLead: { type: Boolean, default: false },
isLineManager: { type: Boolean, default: false },

teamLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
lineManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
})

export default mongoose.model('Staff', StaffSchema)