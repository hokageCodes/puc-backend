import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';

import staffRoutes from './routes/staffRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import practiceAreaRoutes from './routes/practiceAreaRoutes.js';

dotenv.config();
connectDB();

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Mount routes
app.use('/api/staff', staffRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/practice-areas', practiceAreaRoutes);

// 👋 Home route
app.get('/', (req, res) => {
  res.send('👋 Welcome to the PUC API - Server is running!');
});

export default app;


