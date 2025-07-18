// routes/blogRoutes.js
import express from 'express';
import {
  createBlog,
  getAllBlogs,
  getBlogBySlug
} from '../controllers/blogController.js';

import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, createBlog); // Protected
router.get('/', getAllBlogs); // Public
router.get('/:slug', getBlogBySlug); // Public

export default router;
