// controllers/blogController.js
import Blog from '../models/Blog.js';

export const createBlog = async (req, res) => {
  const { title, slug, coverImage, tags, content } = req.body;

  if (!title || !slug || !coverImage || !content) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const exists = await Blog.findOne({ slug });
    if (exists) return res.status(409).json({ message: 'Slug already exists' });

    const newBlog = await Blog.create({
      title,
      slug,
      coverImage,
      tags,
      content,
      createdBy: req.user.id
    });

    res.status(201).json(newBlog);
  } catch (err) {
    console.error('Create blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    console.error('Get blogs error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getBlogBySlug = async (req, res) => {
  const { slug } = req.params;
  try {
    const blog = await Blog.findOne({ slug });
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    res.json(blog);
  } catch (err) {
    console.error('Get blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};
