// controllers/blogController.js
import Blog from '../models/Blog.js';

export const createBlog = async (req, res) => {
  const { title, slug, excerpt, coverImage, tags, content, status, scheduledAt } = req.body;
  
  // Use uploaded file or provided URL
  const imageUrl = req.file?.path || coverImage;

  if (!title || !slug || !imageUrl || !content) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const exists = await Blog.findOne({ slug });
    if (exists) return res.status(409).json({ message: 'Slug already exists' });

    // Parse tags if it's a string
    let parsedTags = tags;
    if (typeof tags === 'string') {
      try {
        parsedTags = JSON.parse(tags);
      } catch (e) {
        parsedTags = tags.split(',').map(t => t.trim()).filter(t => t);
      }
    }

    const blogData = {
      title,
      slug,
      excerpt,
      coverImage: imageUrl,
      tags: parsedTags || [],
      content,
      status: status || 'draft',
      createdBy: req.user.id,
    };

    if (status === 'published') {
      blogData.publishedAt = new Date();
    } else if (status === 'scheduled' && scheduledAt) {
      blogData.scheduledAt = new Date(scheduledAt);
    }

    const newBlog = await Blog.create(blogData);

    res.status(201).json(newBlog);
  } catch (err) {
    console.error('Create blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateBlog = async (req, res) => {
  const { id } = req.params;
  const { title, slug, excerpt, coverImage, tags, content, status, scheduledAt, featured } = req.body;
  
  // Use uploaded file if provided, otherwise use existing or provided URL
  const imageUrl = req.file?.path || coverImage;

  try {
    const blog = await Blog.findById(id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    // Check if slug is being changed and if it already exists
    if (slug && slug !== blog.slug) {
      const exists = await Blog.findOne({ slug });
      if (exists) return res.status(409).json({ message: 'Slug already exists' });
    }

    // Parse tags if it's a string
    let parsedTags = tags;
    if (typeof tags === 'string') {
      try {
        parsedTags = JSON.parse(tags);
      } catch (e) {
        parsedTags = tags.split(',').map(t => t.trim()).filter(t => t);
      }
    }

    const updateData = {
      ...(title && { title }),
      ...(slug && { slug }),
      ...(excerpt !== undefined && { excerpt }),
      ...(imageUrl && { coverImage: imageUrl }),
      ...(tags && { tags: parsedTags || [] }),
      ...(content && { content }),
      ...(status && { status }),
      ...(featured !== undefined && { featured }),
      updatedBy: req.user.id,
    };

    if (status === 'published' && !blog.publishedAt) {
      updateData.publishedAt = new Date();
    } else if (status === 'scheduled' && scheduledAt) {
      updateData.scheduledAt = new Date(scheduledAt);
    }

    const updatedBlog = await Blog.findByIdAndUpdate(id, updateData, { new: true });

    res.json(updatedBlog);
  } catch (err) {
    console.error('Update blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteBlog = async (req, res) => {
  const { id } = req.params;

  try {
    const blog = await Blog.findById(id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    await Blog.findByIdAndDelete(id);

    res.json({ message: 'Blog deleted successfully' });
  } catch (err) {
    console.error('Delete blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllBlogs = async (req, res) => {
  try {
    const { status, featured } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (featured === 'true') filter.featured = true;

    const blogs = await Blog.find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'email');
      
    res.json(blogs);
  } catch (err) {
    console.error('Get blogs error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPublicBlogs = async (req, res) => {
  try {
    // Only return published blogs, sorted by published date or creation date
    const blogs = await Blog.find({ status: 'published' })
      .sort({ publishedAt: -1, createdAt: -1 })
      .populate('createdBy', 'email');
      
    res.json(blogs);
  } catch (err) {
    console.error('Get public blogs error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getBlogById = async (req, res) => {
  const { id } = req.params;
  try {
    const blog = await Blog.findById(id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json(blog);
  } catch (err) {
    console.error('Get blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getBlogBySlug = async (req, res) => {
  const { slug } = req.params;
  try {
    const blog = await Blog.findOne({ slug });
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    // Only increment views for published posts
    if (blog.status === 'published') {
      blog.views += 1;
      await blog.save();
    }

    res.json(blog);
  } catch (err) {
    console.error('Get blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};
