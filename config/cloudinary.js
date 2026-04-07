import { v2 as cloudinary } from 'cloudinary';
import { createRequire } from 'module';
import dotenv from 'dotenv';

dotenv.config();

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

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET
  && process.env.CLOUDINARY_CLOUD_NAME
);

if (!hasCloudinaryConfig) {
  console.warn('Cloudinary configuration incomplete. File uploads will fail until CLOUDINARY_* env vars are set.');
} else {
  console.log(`Cloudinary config loaded for cloud: ${process.env.CLOUDINARY_CLOUD_NAME}`);
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

export { cloudinary, storage, blogStorage, documentStorage };