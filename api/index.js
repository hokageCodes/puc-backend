// Vercel serverless function wrapper for Express app
import app from '../app.js';

// For Vercel with ES modules, export the app directly
// @vercel/node will automatically handle Express apps
export default app;

