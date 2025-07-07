const mongoose = require('mongoose');

const PracticeAreaSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
});

module.exports = mongoose.model('PracticeArea', PracticeAreaSchema);
