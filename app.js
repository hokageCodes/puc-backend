// server.js - FIXED VERSION
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
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

// Load environment variables FIRST
dotenv.config();

// Debug: Log Email service configuration
console.log('🔍 Email Service Configuration:', {
  RESEND_API_KEY: process.env.RESEND_API_KEY ? `✅ Set (${process.env.RESEND_API_KEY.substring(0, 10)}...)` : '❌ MISSING - Will use SMTP',
  RESEND_FROM: process.env.RESEND_FROM || 'not set',
  EMAIL_FROM: process.env.EMAIL_FROM || '❌ MISSING',
  SMTP_HOST: process.env.SMTP_HOST || '❌ MISSING',
  SMTP_PORT: process.env.SMTP_PORT || '❌ MISSING',
  NODE_ENV: process.env.NODE_ENV || 'not set',
});

if (!process.env.RESEND_API_KEY) {
  console.warn('⚠️ WARNING: RESEND_API_KEY is not set. Emails will use SMTP (less reliable).');
  console.warn('💡 To use Resend (recommended): Add RESEND_API_KEY to environment variables and redeploy.');
} else {
  console.log('✅ Resend API configured - emails will use Resend (most reliable!)');
}

// Debug: Log Cloudinary env vars (remove after testing)
console.log('🔍 Cloudinary Configuration:', {
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '❌ MISSING',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ? '✅ Present' : '❌ MISSING',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ? '✅ Present' : '❌ MISSING',
});

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

const app = express();

// Cookie parser MUST come before CORS and routes
app.use(cookieParser());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'https://paulusoro.com',
      'https://www.paulusoro.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://localhost:3000',
      'https://localhost:3001',
      'https://localhost:3002',
      process.env.CLIENT_URL,
      // Vercel URLs
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
      process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null
    ].filter(Boolean);

    const isLocalhost = origin && (
      origin.startsWith('http://localhost') || 
      origin.startsWith('https://localhost') || 
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('https://127.0.0.1')
    );

    const isAllowed = allowedOrigins.includes(origin) || isLocalhost;

    console.log('CORS check - Origin:', origin, 'isLocalhost:', isLocalhost, 'allowed:', isAllowed);

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ]
};

app.use(cors(corsOptions));

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
    // Ensure MongoDB is connected before processing request
    const mongoose = await import('mongoose');
    if (mongoose.default.connection.readyState !== 1) {
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
  console.log(`${req.method} ${req.path}`, {
    cookies: Object.keys(req.cookies),
    allCookies: req.cookies,
    origin: req.headers.origin,
    userAgent: req.headers['user-agent']?.substring(0, 50) + '...',
    hasAuthToken: !!req.cookies.admin_token
  });
  next();
});

// Serve static files
app.use('/uploads', express.static('uploads'));
// Also serve leave attachments
app.use('/api/uploads', express.static('uploads'));

// API routes
// Public staff endpoint (no auth) - used by public site to render team members
import { getPublicStaff } from './controllers/staffController.js';
app.get('/api/public/staff', getPublicStaff);

app.use('/api/staff', staffRoutes);
app.use('/api/leave', leaveRoutes);
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
    cookies: req.cookies,
    environment: process.env.NODE_ENV
  });
});

// SMTP diagnostic endpoint (for debugging production issues)
app.get('/api/diagnostic/smtp', async (req, res) => {
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

// Cookie test endpoint
app.get('/test-cookie', (req, res) => {
  res.cookie('test_cookie', 'working', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 60000
  });
  
  res.json({ 
    message: 'Test cookie set',
    cookies: req.cookies
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

// Only start server if not running on Vercel (serverless)
// Vercel will handle the serverless function invocation
if (process.env.VERCEL !== '1' && !process.env.VERCEL_ENV) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export default app;