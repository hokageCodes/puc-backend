// routes/blogRoutes.js
import express from 'express';
import multer from 'multer';
import { blogStorage } from '../config/cloudinary.js';
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
import { protect } from '../middleware/auth.js';

const upload = multer({ 
  storage: blogStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

const router = express.Router();

// Admin routes (protected) - MUST come before /:slug route
router.post('/upload-image', protect, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  res.json({ url: req.file.path });
});
router.post('/', protect, upload.single('coverImage'), createBlog);
router.put('/:id', protect, upload.single('coverImage'), updateBlog);
router.delete('/:id', protect, deleteBlog);
router.get('/admin/all', protect, getAllBlogs); // Get all blogs with filters
router.get('/id/:id', protect, async (req, res) => {
  // Get single blog by ID for admin
  const { getBlogById } = await import('../controllers/blogController.js');
  getBlogById(req, res);
});

// Public routes
router.get('/public', getPublicBlogs); // Get only published blogs
router.get('/:slug/like-status', getBlogLikeStatus);
router.post('/:slug/like', toggleBlogLike);
router.get('/:slug', getBlogBySlug);

export default router;
