const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// ✅ Import and mount routes
const staffRoutes = require('./routes/staffRoutes');
const adminRoutes = require('./routes/adminRoutes'); // ✅ Add this

app.use('/api/staff', staffRoutes);
app.use('/api/admin', adminRoutes); // ✅ Add this

module.exports = app;
