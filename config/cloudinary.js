import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

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

/**
 * Upload a buffer to Cloudinary and return the secure URL and public_id.
 */
export function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
}

export { cloudinary };
