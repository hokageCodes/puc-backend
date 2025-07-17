// routes/blogRoutes.js
const express = require('express');
const router = express.Router();
const {
  createBlog,
  getAllBlogs,
  getBlogBySlug,
} = require('../controllers/blogController');

router.post('/', createBlog);
router.get('/', getAllBlogs);
router.get('/:slug', getBlogBySlug);

module.exports = router;
