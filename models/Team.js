import mongoose from 'mongoose'

const TeamSchema = new mongoose.Schema({
name: { type: String, required: true },
department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
})

export default mongoose.model('Team', TeamSchema)