// routes/blogRoutes.js
import express from 'express';
import multer from 'multer';
import { storage } from '../config/cloudinary.js';
import {
  createBlog,
  updateBlog,
  deleteBlog,
  getAllBlogs,
  getPublicBlogs,
  getBlogBySlug
} from '../controllers/blogController.js';
import { protect } from '../middleware/auth.js';

const upload = multer({ storage });

const router = express.Router();

// Admin routes (protected) - MUST come before /:slug route
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
router.get('/:slug', getBlogBySlug);

export default router;
