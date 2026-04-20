// controllers/blogController.js
import Blog from '../models/Blog.js';
import sanitizeHtml from 'sanitize-html';
import mongoose from 'mongoose';
import { logAudit } from '../utils/auditLogger.js';

const BLOG_STATUSES = new Set(['draft', 'scheduled', 'published', 'archived']);
const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeSlug = (value) => normalizeString(value).toLowerCase();

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
  const normalizedSlug = normalizeSlug(slug);
  
  // Use uploaded file or provided URL
  const imageUrl = req.file?.path || coverImage;
  
  console.log('Image URL:', imageUrl);

  const resolvedStatus = BLOG_STATUSES.has(status) ? status : 'draft';
  // Cover image is required only for published/scheduled posts, not drafts
  if (!title || !normalizedSlug || !content) {
    console.log('❌ Missing required fields:', { title: !!title, slug: !!slug, content: !!content });
    return res.status(400).json({ message: 'Missing required fields: title, slug, content' });
  }
  if (!imageUrl && resolvedStatus !== 'draft') {
    return res.status(400).json({ message: 'Cover image is required for published or scheduled posts' });
  }

  try {
    console.log('Checking slug uniqueness...');
    const exists = await Blog.findOne({ slug: normalizedSlug });
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
      slug: normalizedSlug,
      excerpt,
      author,
      ...(imageUrl && { coverImage: imageUrl }),
      tags: parsedTags || [],
      content: sanitizedContent,
      status: resolvedStatus,
      createdBy: req.user.id,
    };

    if (resolvedStatus === 'published') {
      blogData.publishedAt = new Date();
    } else if (resolvedStatus === 'scheduled' && scheduledAt) {
      blogData.scheduledAt = new Date(scheduledAt);
    }

    const newBlog = await Blog.create(blogData);
    console.log('✅ Blog created successfully:', newBlog._id);
    await logAudit('CMS_BLOG_CREATE', {
      req,
      blogId: newBlog._id.toString(),
      slug: newBlog.slug,
      status: newBlog.status,
    });

    res.status(201).json(newBlog);
  } catch (err) {
    console.error('❌ Create blog error:', err.message, err.stack);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateBlog = async (req, res) => {
  const { id } = req.params;
  const blogId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }
  const { title, slug, excerpt, author, coverImage, tags, content, status, scheduledAt, featured } = req.body;
  const normalizedSlug = slug ? normalizeSlug(slug) : '';
  
  // Use uploaded file if provided, otherwise use existing or provided URL
  const imageUrl = req.file?.path || coverImage;

  try {
    const blog = await Blog.findById(blogId);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    // Check if slug is being changed and if it already exists
    if (normalizedSlug && normalizedSlug !== blog.slug) {
      const exists = await Blog.findOne({ slug: normalizedSlug });
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
      ...(normalizedSlug && { slug: normalizedSlug }),
      ...(excerpt !== undefined && { excerpt }),
      ...(author !== undefined && { author }),
      ...(imageUrl && { coverImage: imageUrl }),
      ...(tags && { tags: parsedTags || [] }),
      ...(content && { content: sanitizeBlogContent(content) }),
      ...(status && BLOG_STATUSES.has(status) && { status }),
      ...(featured !== undefined && { featured }),
      updatedBy: req.user.id,
    };

    if (status === 'published' && !blog.publishedAt) {
      updateData.publishedAt = new Date();
    } else if (status === 'scheduled' && scheduledAt) {
      updateData.scheduledAt = new Date(scheduledAt);
    }

    const updatedBlog = await Blog.findByIdAndUpdate(blogId, updateData, { new: true });
    await logAudit('CMS_BLOG_UPDATE', {
      req,
      blogId: updatedBlog?._id?.toString() || blogId,
      slug: updatedBlog?.slug,
      status: updatedBlog?.status,
    });

    res.json(updatedBlog);
  } catch (err) {
    console.error('Update blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteBlog = async (req, res) => {
  const { id } = req.params;
  const blogId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  try {
    const blog = await Blog.findById(blogId);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    await Blog.findByIdAndDelete(blogId);
    await logAudit('CMS_BLOG_DELETE', {
      req,
      blogId,
      slug: blog.slug,
      status: blog.status,
    });

    res.json({ message: 'Blog deleted successfully' });
  } catch (err) {
    console.error('Delete blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllBlogs = async (req, res) => {
  try {
    const status = normalizeString(req.query.status);
    const featured = normalizeString(req.query.featured);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (status && BLOG_STATUSES.has(status)) filter.status = status;
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
  const blogId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }
  try {
    const blog = await Blog.findById(blogId);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json(blog);
  } catch (err) {
    console.error('Get blog error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getBlogBySlug = async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  const visitorId = normalizeString(req.query.visitorId);
  try {
    const query = Blog.findOne({ slug, status: 'published' });
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
  const slug = normalizeSlug(req.params.slug);
  const visitorId = normalizeString(req.body.visitorId);

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
  const slug = normalizeSlug(req.params.slug);
  const visitorId = normalizeString(req.query.visitorId);

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
