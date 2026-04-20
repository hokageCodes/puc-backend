import app from './app.js';
import mongoose from 'mongoose';

const PORT = process.env.PORT || 5000;
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });

    await mongoose.connection.close(false);
    clearTimeout(forceExitTimer);
    console.log('Graceful shutdown complete.');
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
