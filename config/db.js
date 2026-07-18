const mongoose = require('mongoose');

const connectDB = async () => {
  // If already connected or connecting, reuse the existing connection
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    console.log('MongoDB: Using existing connection');
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Database connection error: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;
