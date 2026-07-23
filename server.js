const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(mongoSanitize());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use('/api', limiter);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route for database uploads
const uploadRoutes = require('./routes/uploadRoutes');
app.use('/uploads', uploadRoutes);

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const storyRoutes = require('./routes/storyRoutes');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stories', storyRoutes);

// Serve static frontend files if folder exists
const clientPath = path.join(__dirname, '../client');
if (fs.existsSync(clientPath)) {
  app.use(express.static(clientPath));
}

// Fallback route for SPA details or simply redirecting to root
app.get('*', (req, res, next) => {
  // If requesting API, pass to next (error handler)
  if (req.url.startsWith('/api')) {
    return next();
  }
  
  const indexPath = path.join(__dirname, '../client/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ success: true, message: 'ConnectHub Backend API is running' });
  }
});

// Centralized error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  const statusCode = err.status || 500;
  const message = (process.env.NODE_ENV === 'production' && statusCode === 500)
    ? 'Internal Server Error'
    : err.message || 'Server error';

  res.status(statusCode).json({
    success: false,
    error: message
  });
});

const PORT = process.env.PORT || 5000;

// Only listen on a port if not in a serverless/production environment
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

module.exports = app;

