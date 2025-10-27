// app.js or server.js - Fixed CORS configuration
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';

import blogRoutes from './routes/blogRoutes.js';
import staffRoutes from './routes/staffRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import practiceAreaRoutes from './routes/practiceAreaRoutes.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Cookie parser MUST come before CORS and routes
app.use(cookieParser());

// CORS configuration - CRITICAL for cookie handling
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
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
      process.env.CLIENT_URL
    ].filter(Boolean);

    // Allow localhost in all environments for development ease
    const isLocalhost = origin && (
      origin.startsWith('http://localhost') || 
      origin.startsWith('https://localhost') || 
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('https://127.0.0.1')
    );

    // Allow if it's in the allowed list OR if it's localhost
    const isAllowed = allowedOrigins.includes(origin) || isLocalhost;

    console.log('CORS check - Origin:', origin, 'isLocalhost:', isLocalhost, 'allowed:', isAllowed);

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // CRITICAL: This must be true for cookies to work
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

// JSON parsing middleware
app.use(express.json());

// Add comprehensive request logging
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

// API routes
app.use('/api/staff', staffRoutes);
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

// Cookie test endpoint
app.get('/test-cookie', (req, res) => {
  res.cookie('test_cookie', 'working', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 60000 // 1 minute
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
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

export default app;