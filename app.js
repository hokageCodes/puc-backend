// server.js - FIXED VERSION
import { protect, requireRoles, requireAuth } from './middleware/auth.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import connectDB from './config/db.js';

import blogRoutes from './routes/blogRoutes.js';

import staffRoutes from './routes/staffRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import practiceAreaRoutes from './routes/practiceAreaRoutes.js';
import authRoutes from './routes/authRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import leaveTypeRoutes from './routes/leaveTypeRoutes.js';
import courtDiaryRoutes from './routes/courtDiaryRoutes.js';


import rateLimit from 'express-rate-limit';


// Initialize app BEFORE any app.use/app.get
const app = express();

// Rate limiting middleware. The previous 100/15min was far too low for this app's
// request patterns (each page fires several calls), so normal use tripped it.
const isProduction = process.env.NODE_ENV === 'production';
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Per IP. Office staff often share one public IP (NAT), so this must comfortably
  // cover the whole team at once. Env-overridable. Coarse DoS ceiling only —
  // brute-force protection lives on the auth endpoints (login/reset limiters).
  max: Number(process.env.API_RATE_LIMIT_MAX) || 10000,
  standardHeaders: true,
  legacyHeaders: false,
  // Don't rate-limit local development (hot reloads + StrictMode double-fetch).
  skip: () => !isProduction,
  message: {
    error: 'Too many requests, please try again later.'
  }
});
// NOTE: applied AFTER CORS below so a 429 still carries CORS headers (otherwise the
// browser reports a generic "failed to fetch" instead of the rate-limit message).

// JSON APIs must not be cached by browsers or shared proxies (stale admin/CMS data across devices)
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate');
  next();
});

// Load environment variables FIRST
dotenv.config();

if (!process.env.RESEND_API_KEY) {
  console.warn('⚠️ WARNING: RESEND_API_KEY is not set. Emails will use SMTP (less reliable).');
  console.warn('💡 To use Resend (recommended): Add RESEND_API_KEY to environment variables and redeploy.');
} else {
  console.log('✅ Resend API configured - emails will use Resend (most reliable!)');
}

// Configure Cloudinary AFTER dotenv
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify Cloudinary config
if (!process.env.CLOUDINARY_API_KEY) {
  console.error('❌ CRITICAL: Cloudinary API key missing!');
} else {
  console.log('✅ Cloudinary configured successfully');
}

// Connect to MongoDB (connection is cached for serverless environments)
// This will be called on first request in serverless, but connection is reused
connectDB().catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
});



// Cookie parser MUST come before CORS and routes
app.use(cookieParser());



const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  process.env.LEAVE_PORTAL_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  // Let the browser read pagination metadata on cross-origin responses.
  exposedHeaders: ['X-Total-Pages'],
}));

// Apply the API rate limiter AFTER CORS so a 429 still carries CORS headers
// (otherwise the browser reports a generic "failed to fetch"). Skipped in dev.
app.use('/api/', apiLimiter);

// FIXED: Proper conditional body parsing middleware
// Skip body parsing entirely for multipart/form-data - multer will handle it
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  if (contentType.includes('multipart/form-data')) {
    // Skip ALL body parsing for multipart/form-data - multer will handle it
    // This is critical - express.json() and express.urlencoded() will consume the stream
    // and leave nothing for multer to parse
    return next();
  }
  
  // For non-multipart requests, parse JSON and urlencoded
  express.json()(req, res, (err) => {
    if (err) {
      console.error('JSON parsing error:', err);
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    express.urlencoded({ extended: true })(req, res, next);
  });
});

// Database connection middleware - ensures DB is connected before handling requests
// Critical for serverless environments where connection might not be ready on first request
app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      // Connection not ready, wait for it
      await connectDB();
    }
    next();
  } catch (error) {
    console.error('Database connection error in middleware:', error);
    res.status(503).json({ 
      error: 'Service temporarily unavailable', 
      message: 'Database connection failed. Please try again in a moment.' 
    });
  }
});

// Request logging
app.use((req, res, next) => {
  const hasCookie = !!req.cookies.admin_token;
  const hasBearer = req.headers.authorization?.startsWith('Bearer ');
  console.log(`${req.method} ${req.path}`, {
    origin: req.headers.origin,
    auth: hasCookie ? 'cookie' : hasBearer ? 'bearer' : 'none',
  });
  next();
});


// SECURE FILE DOWNLOAD ENDPOINT (RBAC enforced)
import path from 'path';
import fs from 'fs';
// Only allow admins, CMS, or the file owner to download
app.get('/api/secure-download/:filename', protect, requireRoles('admin', 'cms'), (req, res) => {
  const { filename } = req.params;
  // Prevent path traversal
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
    return res.status(400).json({ message: 'Invalid filename' });
  }
  const filePath = path.join(process.cwd(), 'uploads', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }
  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('File download error:', err);
      res.status(500).json({ message: 'Error downloading file' });
    }
  });
});

// API routes
// Public staff endpoints (no auth) - used by public site to render team members
import { getPublicStaff, getPublicStaffById } from './controllers/staffController.js';
app.get('/api/public/staff', getPublicStaff);
app.get('/api/public/staff/:id', getPublicStaffById);

app.use('/api/staff', staffRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/leave-types', leaveTypeRoutes);
app.use('/api/court-diary', courtDiaryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/practice-areas', practiceAreaRoutes);
app.use('/api/blogs', blogRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: '👋 Welcome to the PUC API - Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cookies: Object.keys(req.cookies)
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// SMTP diagnostic endpoint (for debugging production issues)
app.get('/api/diagnostic/smtp', requireAuth({ scope: 'cms' }), requireRoles('admin'), async (req, res) => {
  const { verifyConnection } = await import('./utils/email.js');
  
  const emailConfig = {
    // Resend (Recommended - easiest!)
    RESEND_API_KEY: process.env.RESEND_API_KEY ? '✅ Set (RECOMMENDED!)' : '❌ Missing',
    RESEND_FROM: process.env.RESEND_FROM || 'not set',
    
    // SMTP (Fallback)
    SMTP_HOST: process.env.SMTP_HOST ? '✅ Set' : '❌ Missing',
    SMTP_PORT: process.env.SMTP_PORT || '❌ Missing',
    SMTP_USER: process.env.SMTP_USER ? '✅ Set' : '❌ Missing',
    SMTP_PASS: process.env.SMTP_PASS ? '✅ Set' : '❌ Missing',
    SMTP_SECURE: process.env.SMTP_SECURE || 'not set (defaults based on port)',
    
    // Common
    EMAIL_FROM: process.env.EMAIL_FROM || '❌ Missing',
    NODE_ENV: process.env.NODE_ENV || 'not set',
  };
  
  let connectionStatus = 'Not tested';
  let recommendation = '';
  
  if (process.env.RESEND_API_KEY) {
    connectionStatus = '✅ Resend API configured (no connection test needed)';
    recommendation = 'Resend is configured and will be used automatically. This is the most reliable option!';
  } else {
    try {
      const isConnected = await verifyConnection();
      connectionStatus = isConnected ? '✅ SMTP Connected' : '❌ SMTP Connection failed';
      if (!isConnected) {
        recommendation = 'SMTP connection failed. Consider using Resend API (RESEND_API_KEY) - it\'s free and much more reliable!';
      }
    } catch (error) {
      connectionStatus = `❌ SMTP Error: ${error.message}`;
      recommendation = 'SMTP is having issues. Use Resend API (RESEND_API_KEY) instead - sign up at https://resend.com (free 3,000 emails/month)';
    }
  }
  
  res.json({
    emailConfig,
    connectionStatus,
    recommendation: recommendation || 'All good!',
    timestamp: new Date().toISOString(),
    note: process.env.RESEND_API_KEY 
      ? 'Resend is configured - emails will use Resend API (most reliable!)'
      : 'Check environment variables section if any are missing. Consider Resend API for better reliability.'
  });
});

// Fallback for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Uploaded file is too large. Maximum size is 5MB.'
      : err.message;
    return res.status(400).json({ error: 'Upload error', message });
  }

  const status = err.status || 500;
  const message = err.message || 'Something went wrong';

  res.status(status).json({
    error: status === 500 ? 'Internal server error' : 'Request failed',
    message: process.env.NODE_ENV === 'development' ? message : status === 500 ? 'Something went wrong' : message,
    ...(process.env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {}),
  });
});

export default app;