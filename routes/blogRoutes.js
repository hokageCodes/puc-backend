import express from 'express';
import multer from 'multer';
import { uploadBuffer } from '../config/cloudinary.js';
import {
  createBlog,
  updateBlog,
  deleteBlog,
  getAllBlogs,
  getPublicBlogs,
  getBlogBySlug,
  toggleBlogLike,
  getBlogLikeStatus
} from '../controllers/blogController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// Memory storage — we upload to Cloudinary manually after multer parses the file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10MB per file
    fieldSize: 20 * 1024 * 1024, // 20MB for large HTML content fields
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported image type. Allowed: jpg, png, webp, gif'));
    }
    cb(null, true);
  },
});

const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Image file too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ message: `Upload error: ${err.message}` });
  }
  if (err) {
    console.error('Upload middleware error:', err);
    return res.status(500).json({ message: err.message || 'Upload failed' });
  }
  next();
};

/**
 * After multer puts the file in req.file.buffer, push it to Cloudinary.
 * Attaches req.file.path (the CDN URL) so controllers work unchanged.
 */
const uploadToCloudinary = (folder) => async (req, res, next) => {
  if (!req.file) return next();
  try {
    const result = await uploadBuffer(req.file.buffer, { folder, resource_type: 'image' });
    req.file.path = result.secure_url;
    req.file.public_id = result.public_id;
    next();
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    return res.status(500).json({ message: `Image upload failed: ${err.message}` });
  }
};

const router = express.Router();

// Accept the unified hub session alongside the legacy CMS session during migration.
const cmsOrHub = requireAuth({ scope: ['hub', 'cms'] });

// Admin routes (protected) — MUST come before /:slug route
router.post(
  '/upload-image',
  cmsOrHub,
  requireRoles('admin', 'cms'),
  upload.single('image'),
  handleUploadError,
  uploadToCloudinary('puc-blog-inline'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    res.json({ url: req.file.path });
  }
);

router.post(
  '/',
  cmsOrHub,
  requireRoles('admin', 'cms'),
  upload.single('coverImage'),
  handleUploadError,
  uploadToCloudinary('puc-blog-covers'),
  validateBody({
    allowlist: ['title', 'slug', 'excerpt', 'author', 'coverImage', 'tags', 'content', 'status', 'scheduledAt', 'featured'],
    required: ['title', 'slug', 'content'],
  }),
  createBlog
);

router.put(
  '/:id',
  cmsOrHub,
  requireRoles('admin', 'cms'),
  upload.single('coverImage'),
  handleUploadError,
  uploadToCloudinary('puc-blog-covers'),
  validateBody({ allowlist: ['title', 'slug', 'excerpt', 'author', 'coverImage', 'tags', 'content', 'status', 'scheduledAt', 'featured'] }),
  updateBlog
);

router.delete('/:id', cmsOrHub, requireRoles('admin', 'cms'), deleteBlog);
router.get('/admin/all', cmsOrHub, requireRoles('admin', 'cms'), getAllBlogs);
router.get('/id/:id', cmsOrHub, async (req, res) => {
  const { getBlogById } = await import('../controllers/blogController.js');
  getBlogById(req, res);
});

// Public routes
router.get('/public', getPublicBlogs);
router.get('/:slug/like-status', getBlogLikeStatus);
router.post('/:slug/like', toggleBlogLike);
router.get('/:slug', getBlogBySlug);

export default router;
