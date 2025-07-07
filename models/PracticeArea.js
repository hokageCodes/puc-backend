import mongoose from 'mongoose';

const PracticeAreaSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
});

export default mongoose.model('PracticeArea', PracticeAreaSchema);
