// models/Blog.js
const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema(
    {
        title: { type: String, required: true },
        slug: { type: String, required: true, unique: true },
        coverImage: String,
        tags: [String],
        content: { type: String, required: true }, // Rich HTML
    },
    { timestamps: true }
);

module.exports = mongoose.model('Blog', blogSchema);
