import { v2 as cloudinary } from 'cloudinary';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Try different import methods for multer-storage-cloudinary
let CloudinaryStorage;
try {
  // Method 1: Named export
  const storageModule = require('multer-storage-cloudinary');
  CloudinaryStorage = storageModule.CloudinaryStorage || storageModule;
} catch (err) {
  console.error('Failed to load multer-storage-cloudinary:', err.message);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify Cloudinary config
if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_CLOUD_NAME) {
  console.error('❌ Cloudinary configuration incomplete. Check your .env file.');
} else {
  console.log('✅ Cloudinary configured:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY ? 'Present' : 'Missing',
    api_secret: process.env.CLOUDINARY_API_SECRET ? 'Present' : 'Missing',
  });
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'puc-staff-photos',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
  },
});

// Storage for blog/news cover images
const blogStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'puc-blog-covers',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    // Optimize: smaller transformation, better compression
    transformation: [{ 
      width: 1600, 
      height: 900, 
      crop: 'limit', 
      quality: 'auto:eco',  // Use eco quality for faster uploads
      fetch_format: 'auto'   // Auto-select best format
    }],
  },
});

// Storage for leave request attachments (documents)
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'puc-leave-attachments',
    allowed_formats: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png'],
    resource_type: 'auto', // Allow both images and documents
  },
});

if (!process.env.CLOUDINARY_API_KEY) {
  console.error('❌ Cloudinary API key missing. Check your .env file.');
} else {
  console.log('✅ Cloudinary config loaded for cloud:', process.env.CLOUDINARY_CLOUD_NAME);
}

export { cloudinary, storage, blogStorage, documentStorage };