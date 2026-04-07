// controllers/blogController.js
import Blog from '../models/Blog.js';
import sanitizeHtml from 'sanitize-html';

const sanitizeBlogContent = (value) =>
  sanitizeHtml(value || '', {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'h3'],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' }),
    },
  });

export const createBlog = async (req, res) => {
  console.log('📝 Creating blog post...');
  console.log('File uploaded:', req.file ? 'Yes' : 'No');
  
  const { title, slug, excerpt, author, coverImage, tags, content, status, scheduledAt } = req.body;
  
  // Use uploaded file or provided URL
  const imageUrl = req.file?.path || coverImage;
  
  console.log('Image URL:', imageUrl);

  if (!title || !slug || !imageUrl || !content) {
    console.log('❌ Missing required fields:', { title: !!title, slug: !!slug, imageUrl: !!imageUrl, content: !!content });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    console.log('Checking slug uniqueness...');
    const exists = await Blog.findOne({ slug });
    if (exists) {
      console.log('❌ Slug already exists');
      return res.status(409).json({ message: 'Slug already exists' });
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

    console.log('Creating blog document...');
    const sanitizedContent = sanitizeBlogContent(content);

    if (!sanitizedContent.trim()) {
      return res.status(400).json({ message: 'Blog content is invalid after sanitization' });
    }

    const blogData = {
      title,
      slug,
      excerpt,
      author,
      coverImage: imageUrl,
      tags: parsedTags || [],
      content: sanitizedContent,
      status: status || 'draft',
      createdBy: req.user.id,
    };

    if (status === 'published') {
      blogData.publishedAt = new Date();
    } else if (status === 'scheduled' && scheduledAt) {
      blogData.scheduledAt = new Date(scheduledAt);
    }

    const newBlog = await Blog.create(blogData);
    console.log('✅ Blog created successfully:', newBlog._id);

    res.status(201).json(newBlog);
  } catch (err) {
    console.error('❌ Create blog error:', err.message, err.stack);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateBlog = async (req, res) => {
  const { id } = req.params;
  const { title, slug, excerpt, author, coverImage, tags, content, status, scheduledAt, featured } = req.body;
  
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
      ...(author !== undefined && { author }),
      ...(imageUrl && { coverImage: imageUrl }),
      ...(tags && { tags: parsedTags || [] }),
      ...(content && { content: sanitizeBlogContent(content) }),
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
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (status) filter.status = status;
    if (featured === 'true') filter.featured = true;

    const [blogs, total] = await Promise.all([
      Blog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'email')
      .lean(),
      Blog.countDocuments(filter),
    ]);
      
    res.json({
      data: blogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Get blogs error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPublicBlogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const skip = (page - 1) * limit;

    // Only return published blogs, sorted by published date or creation date
    const filter = { status: 'published' };
    const [blogs, total] = await Promise.all([
      Blog.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('title slug excerpt author coverImage tags publishedAt createdAt featured views likesCount')
      .lean(),
      Blog.countDocuments(filter),
    ]);
      
    res.json({
      data: blogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
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
  const { visitorId } = req.query;
  try {
    const query = Blog.findOne({ slug });
    if (visitorId) {
      query.select('+likedVisitorIds');
    }
    const blog = await query;
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    // Only increment views for published posts; use atomic increment to avoid lost updates.
    if (blog.status === 'published') {
      await Blog.updateOne({ _id: blog._id }, { $inc: { views: 1 } });
      blog.views = (blog.views || 0) + 1;
    }

    const blogData = blog.toObject();

    if (visitorId) {
      blogData.isLiked = blog.likedVisitorIds?.includes(visitorId);
      delete blogData.likedVisitorIds;
    }

    blogData.likesCount = blog.likesCount || 0;

    res.json(blogData);
  } catch (err) {
    console.error('Get blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const toggleBlogLike = async (req, res) => {
  const { slug } = req.params;
  const { visitorId } = req.body;

  if (!visitorId) {
    return res.status(400).json({ message: 'visitorId is required' });
  }

  try {
    const blog = await Blog.findOne({ slug }).select('+likedVisitorIds');
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    const existingIndex = blog.likedVisitorIds.findIndex((id) => id === visitorId);
    let isLiked;

    if (existingIndex === -1) {
      blog.likedVisitorIds.push(visitorId);
      isLiked = true;
    } else {
      blog.likedVisitorIds.splice(existingIndex, 1);
      isLiked = false;
    }

    blog.likesCount = blog.likedVisitorIds.length;
    await blog.save();

    res.json({ likesCount: blog.likesCount, isLiked });
  } catch (err) {
    console.error('Toggle blog like error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getBlogLikeStatus = async (req, res) => {
  const { slug } = req.params;
  const { visitorId } = req.query;

  if (!visitorId) {
    return res.status(400).json({ message: 'visitorId is required' });
  }

  try {
    const blog = await Blog.findOne({ slug }).select('+likedVisitorIds');
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    const isLiked = blog.likedVisitorIds.includes(visitorId);

    res.json({ likesCount: blog.likesCount || 0, isLiked });
  } catch (err) {
    console.error('Get blog like status error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};
