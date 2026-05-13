import mongoose from 'mongoose';

// Cache the connection to reuse in serverless environments (Vercel)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const getMongoUri = () =>
  process.env.MONGODB_URI?.trim() ||
  process.env.MONGO_URI?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  '';

const connectDB = async () => {
  // If already connected, return the existing connection
  if (cached.conn) {
    return cached.conn;
  }

  // If connection is in progress, wait for it
  if (!cached.promise) {
    const uri = getMongoUri();
    if (!uri) {
      const err = new Error(
        'Missing MongoDB URI: set MONGODB_URI (or MONGO_URI / DATABASE_URL) in puc-backend/.env'
      );
      console.error(`❌ ${err.message}`);
      throw err;
    }

    const opts = {
      bufferCommands: true, // Changed to true for serverless - allows queuing commands while connecting
    };
    if (process.env.MONGODB_DB_NAME) {
      opts.dbName = process.env.MONGODB_DB_NAME;
    }

    cached.promise = mongoose.connect(uri, opts).then((mongoose) => {
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
