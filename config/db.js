import mongoose from 'mongoose';

// Cache the connection to reuse in serverless environments (Vercel)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // If already connected, return the existing connection
  if (cached.conn) {
    return cached.conn;
  }

  // If connection is in progress, wait for it
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      dbName: 'PUC',
    };

    cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then((mongoose) => {
      console.log(`✅ MongoDB connected to ${mongoose.connection.name}`);
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error(`❌ MongoDB connection error: ${e.message}`);
    throw e;
  }

  return cached.conn;
};

export default connectDB;
